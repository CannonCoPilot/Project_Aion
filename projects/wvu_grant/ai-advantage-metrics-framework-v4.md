# IMAGINE-AI: Metrics and Comparative Framework

**DE-FOA-0003612, Focus Area 2-B: Genotype to Phenotype (BER)**

---

## 1. The AI Advantage in Genotype-to-Phenotype Prediction

AI advantage operates at three levels: **throughput amplification** (faster analysis), **quality enhancement** (more accurate predictions), and **latent pattern discovery** (connecting dots across genomic, transcriptomic, and metabolic data that reveal nonlinear relationships invisible to traditional analytical frameworks).

For IMAGINE-AI, the central challenge is that genetic potential routinely fails to translate into realized function — and the gap widens dramatically when organisms interact in communities. Traditional statistical approaches (logistic regression, GLMM) treat genomic features as independent, additive predictors. This assumption breaks down for emergent phenotypes governed by multi-gene interactions, regulatory feedback, and community context.

---

## 2. Five Dimensions of AI Advantage

AI-enhanced and traditional genotype-to-phenotype methods differ across five dimensions — not merely in degree but in kind.

### D1: Feature Representation — From Annotations to Learned Embeddings

Traditional methods represent genomes as vectors of annotated features: Pfam domain counts, KEGG ortholog presence/absence, GC content. These hand-engineered features capture known biology but miss unannotated sequence space entirely. Protein language models (ESM-style) and genome foundation models learn representations directly from sequence, capturing structural and functional signals in regions with no database annotation. This is not incremental improvement — it is the difference between searching with a flashlight (known annotations) and illuminating the whole room (learned representations).

### D2: Interaction Modeling — From Independent Features to Network Awareness

Logistic regression and GLMM treat each genomic feature as an independent predictor. Gene-gene interactions, pathway synergies, and regulatory cross-talk — the mechanisms that determine whether genetic potential becomes realized function — are structurally invisible to additive models. GNNs and transformer attention mechanisms model these interactions explicitly, capturing the nonlinear, context-dependent relationships between genomic features that govern complex phenotypes like nitrogen fixation efficiency. Evidence that phylogenetic position predicts functional traits — and that these relationships are nonlinear — comes from qSIP work showing substrate assimilation patterns are phylogenetically conserved but context-dependent (Campbell & Morrissey 2022, *Environ. Microbiol.*; Morrissey et al. 2023, *ISME Commun.*).

### D3: Scale and Integration — From Single-Omics to Multi-Modal Fusion

Traditional approaches typically analyze one data type at a time — genomics OR transcriptomics OR metabolomics — with post-hoc integration by human interpretation. Multimodal deep learning jointly models genomic potential, transcriptomic expression, metabolomic output, and environmental context in a single representation space, enabling predictions that account for the full causal chain from gene to function to product.

### D4: Data Quality — From Manual Curation to AI-Assisted Harmonization

Reference database quality constrains all downstream analyses. Marti et al. (2025, *mSystems*) demonstrated that contamination and version asynchrony between NCBI nucleotide and taxonomy databases introduce spurious classifications that propagate silently through traditional pipelines. Their decontaminated Centrifuge indices (1.0–1.4 trillion nucleotides), developed at LLNL by IMAGINE-AI team members, address this for taxonomic assignment. More broadly, AI-assisted data harmonization — LLM-based ontology mapping, neural imputation of missing phenotype data — can break the curation bottleneck that limits training data quality for all downstream models.

### D5: Community Prediction — From Additive Assembly to Emergent Behavior

Traditional community phenotype prediction sums individual organism contributions. This fails when realized community phenotype depends on inter-species interactions: metabolic cross-feeding, competitive exclusion, niche partitioning. AI models operating on interaction-aware representations can capture these "team effects" — the emergent behaviors that make consortia optimization possible. Work by IMAGINE-AI team members has demonstrated that microbial life history traits vary predictably across habitats (Blazewicz, Morrissey, Pett-Ridge et al. 2023, *ISME J.*) and that free-living diazotrophs invest extracellular metabolites to sustain nitrogen fixation in community contexts (Wilhelm & Hofmockel 2022, *AEM*) — both examples of emergent community-level phenotypes that additive individual-organism models fail to predict.

---

## 3. The Paradigm Shift: Throughput, Quality, and Discovery

The distinction between the three levels of AI advantage is not academic — it determines what metrics are appropriate and what claims the project can make.

**Throughput amplification** (Level 1) means AI performs analytical tasks faster. Measurable, important, but not transformative. Every field achieves this with automation.

**Quality enhancement** (Level 2) means AI produces more accurate predictions on the same data. Measurable by F1, RMSE, AUROC against held-out test sets. This is where most published AI-vs-traditional comparisons operate, and where IMAGINE-AI's decision gate metrics (≥5 pp F1 improvement, ≥10% RMSE reduction) are set.

**Latent pattern discovery** (Level 3) means AI reveals biological relationships that traditional methods structurally cannot detect — not because traditional tools lack statistical power, but because the relationships are nonlinear, high-dimensional, or context-dependent in ways that additive models cannot represent. This is "connecting the dots we don't know to look for." It is the hardest level to quantify and the most compelling to demonstrate.

A proposal that demonstrates only Level 1 is a workflow improvement. A proposal that demonstrates Levels 1+2 is a better tool. A proposal that demonstrates all three levels is a paradigm shift.

---

## 4. Retrospective Benchmarking: The "Comps" Approach

### Design

Rather than constructing a parallel non-AI pipeline, we benchmark IMAGINE-AI against published pre-AI genotype-to-phenotype studies with known outcomes. Each published study serves as an independent baseline with its own dataset, methods, and reported performance.

**Protocol**:

1. **Curate a reference set** of 15–20 published studies (2020–2026) that predicted microbial phenotypes from genomic data using traditional statistical or early ML methods. Selection criteria: raw data publicly available, methods reproducible, quantitative performance metrics reported.

2. **Run the same input data through IMAGINE-AI**, operated by agentic AI workflows handling data retrieval, harmonization, feature engineering, model training, and evaluation.

3. **Compare result quality**: predictive accuracy on the same test organisms, number of organisms for which predictions could be made, and novel interaction patterns identified.

4. **Forward validation**: AI predictions exceeding published results — particularly for organisms not covered in original studies — are selected for experimental confirmation.

Each included study is an independent comparison with its own performance ceiling. Sampling from 15–20 published baselines provides statistical power without requiring parallel human effort.

### 20 Comparable Published Studies

Literature review identified 20 peer-reviewed studies (2020–2026) matching the IMAGINE-AI framework. These organize into three module types that a unified pipeline must support:

**Module A — Categorical Phenotype Classifiers** (11 studies): Pfam/KEGG annotation → ML classifier → phenotype label. Studies share compatible feature extraction (InterProScan → Pfam) and differ primarily in phenotype labels and classifier choice.

| Study | Phenotype | Method | Performance | Database |
|-------|-----------|--------|-------------|----------|
| Koblitz et al. 2025, *Commun. Biol.* | Gram, motility, spore, O₂, temp (6 traits) | Random Forest on Pfam | F1 0.89–0.97 | BacDive |
| Bizzotto et al. 2024, *Environ. Microbiome* (MICROPHERRET) | 86 metabolic traits incl. N₂ fixation | RF on KEGG KOs | MCC 0.92 (N-fix) | FAPROTAX |
| Li et al. 2023, *PLoS Comput. Biol.* | Carbon source utilization (~100 compounds) | Lasso/RF on Pfam | AUROC 0.81 | BiologDB |
| Machado et al. 2025, *PeerJ* (SpoMAG) | Sporulation in MAGs | RF+SVM | Acc 95%, MCC 0.90 | NCBI |
| Flamholz et al. 2024, *mSystems* | O₂ utilization (annotation-free) | LR/RF on amino acid comp | Acc 85% (binary) | BacDive |
| Wan et al. 2025, *Genomics* | O₂ preference | RF on Pfam | Acc 90.6% | BacDive |
| Ramoneda et al. 2023, *Sci. Adv.* | pH preference (continuous) | XGBoost on Pfam | R²=0.80 | GTDB |
| Liu et al. 2025, *BMC Genomics* | Optimal growth temp (continuous) | RF on Pfam | R²=0.853 | BacDive |
| Gralka et al. 2023, *Sir. Microbiol.* | Carbon catabolic preferences | RF on CAZymes | Acc 82%, AUROC 0.88 | NCBI |
| Geller-McGrath et al. 2024, *eLife* (MetaPathPredict) | 107 KEGG modules in incomplete MAGs | Neural net ensemble | AUROC 0.92, F1 0.88 | GTDB |
| Gomez-Perez & Keller 2025, *NAR Genom. Bioinform.* (NLP4Pheno) | Multi-phenotype via NLP+genome | BERT+XGBoost | F1 0.70–0.97 | BacDive (val) |

**Module B — Growth Rate Predictors** (7 studies): Codon usage bias (CUB) or peak-to-trough ratio (PTR) → regression → quantitative growth rate. Applicable to genomes, MAGs, and metagenomes.

| Study | Scope | Method | Performance | Database |
|-------|-------|--------|-------------|----------|
| Weissman et al. 2021, *PNAS* (gRodon) | Max growth rate, isolates+metagenomes | CUB regression | r=0.84 | µGrowthDB |
| Xu et al. 2025, *Sir. Commun.* (Phydon) | Max growth rate, phylogeny-informed | CUB+phylogenetic ensemble | r=0.93 | µGrowthDB |
| Long et al. 2021, *ISME J.* | Growth rate benchmark, marine MAGs | CUB/PTR comparison | r=0.57 (MAGs) | µGrowthDB |
| Weissman et al. 2022, *mSystems* (gRodon MMv2) | Community-wide growth from metagenomes | CUB piecewise regression | GC-bias corrected | NCBI |
| Joseph et al. 2022, *Genome Res.* (CoPTR) | In situ growth from metagenome PTR | Log-linear regression | MAE −30% vs iRep | NCBI |
| Osburn et al. 2024, *Sir. Commun.* | Global soil bacterial growth potential | XGBoost+gRodon | r²=0.62 | NCBI SRA |
| Blazewicz, Morrissey, Pett-Ridge et al. 2025, *PNAS* | In situ soil growth vs ¹⁸O-SIP | CUB+genome size regression | r²=0.61 vs isotope | Custom |

**Module C — Mechanistic/Trait-Based Models** (2 studies): Genome-derived traits → dynamic energy budget or HMM rule systems → ecological predictions.

| Study | Scope | Method | Performance |
|-------|-------|--------|-------------|
| Karaoz & Brodie 2022, *Front. Bioinform.* (microTrait) | 16 trait categories, soil bacteria | HMM+regression | r=0.65 (growth) |
| Marschmann, Pett-Ridge et al. 2024, *Sir. Microbiol.* | Growth rate, CUE, substrate kinetics (rhizosphere) | RF+DEB model | r²=0.85 |

**Pipeline modularity**: ~70% shared infrastructure (genome annotation, feature extraction, evaluation framework), ~30% module-specific code. Four algorithmic pathways needed: (1) annotation → classifier, (2) CUB regression, (3) PTR inference, (4) mechanistic modeling.

**Gap**: No published ML study (2020–2026) predicts bacterial fatty acid composition from genomic features. This represents a genuine knowledge frontier for IMAGINE-AI.

### Team-Internal Benchmarks

In addition to external comps, IMAGINE-AI should demonstrate improvement over the team's own published results. These studies use the same data sources and methodological frameworks that IMAGINE-AI will build on — making them the most honest and directly testable benchmarks.

| Study | PI(s) | Phenotype / Task | Method | Performance | Comp Value |
|-------|-------|-----------------|--------|-------------|------------|
| Morrissey et al. 2024, *Environ. Microbiol.* 26:e16580 | Morrissey | CUE from genomic traits | Regression | Reported G2P correlation | Can IMAGINE-AI's GNNs beat linear genomic-trait models for CUE? |
| Campbell & Morrissey 2022, *Environ. Microbiol.* 24:5900 | Morrissey | Substrate assimilation (qSIP) | Phylogenetic correlation | Per-taxon assimilation rates | Can IMAGINE-AI predict substrate assimilation from genome features beyond what phylogeny alone predicts? |
| Schwartz & Blazewicz 2022, *mBio* 13:e02562-22 | Blazewicz | Life history strategy from genome features | Genomic trait regression | Genome size, rRNA copy → life history | Can IMAGINE-AI's learned embeddings outperform hand-selected genomic features? |
| Greenlon et al. 2022, *mSystems* 7:e00105-22 | Hofmockel, Blazewicz, Pett-Ridge, Kimbrel | qSIP growth across N/P gradients | Statistical analysis of qSIP + MAGs | Per-taxon growth rates | Can IMAGINE-AI predict taxon-specific nutrient responses from genome content? |
| Kimbrel et al. 2025, *ISME J* 19:1 | Kimbrel | Biofertilizer colonization success | Genomic compatibility analysis | Establishment prediction | Can IMAGINE-AI predict SynCom success from genome interaction features? |

These internal comps serve a dual purpose: (1) they provide performance baselines where the team has intimate knowledge of the data, methods, and limitations; (2) demonstrating improvement over one's own published work is among the most credible forms of evidence for AI advantage, because it eliminates the concern that differences reflect dataset or methodology artifacts rather than genuine AI contribution.

---

## 5. Reciprocal Confirmation: Validating AI Discoveries Without Wet Lab for Every Prediction

A persistent challenge for metrics that measure "AI finds things traditional methods miss" (PFE, DMIR, IDR) is distinguishing genuine discoveries from false positives. Experimental validation for every prediction is infeasible. We propose a **Reciprocal Confirmation Protocol** that uses traditional methods as a validation layer.

**Protocol**:

1. IMAGINE-AI identifies novel predictions — phenotypes for under-characterized organisms, gene-gene interactions, consortia emergence patterns.

2. Each AI-unique prediction is reformulated as a *targeted hypothesis* for traditional methods:

| AI Discovery Type | Reciprocal Confirmation |
|---|---|
| Phenotype prediction for organism X | Fit GLMM with the specific genomic features AI identified as predictive; test significance |
| Gene-gene interaction effect | Add the specific interaction term to GLMM (which wouldn't have tested it among millions of possible pairs); test significance |
| Consortia composition → emergent behavior | Fit additive model plus the specific non-additive term AI identified; test whether it improves fit |
| Functional annotation for unannotated protein | Use AI-predicted function to design targeted PSI-BLAST/HMM search; check if weak homology surfaces |

3. Score each prediction:
   - **Category A — Confirmed**: Traditional method finds the signal when given the specific hypothesis. AI advantage = *discovery speed* (traditional could have found it but wouldn't have looked).
   - **Category B — Unconfirmable**: Traditional method lacks power or reference coverage to test. AI advantage = *capability expansion* (structurally beyond traditional methods). These are candidates for experimental validation.
   - **Category C — Refuted**: Traditional method contradicts the AI prediction. These are *false positives*.

4. The **Reciprocal Confirmation Rate (RCR)** = A / (A + C). The **Capability Expansion Fraction** = B / (A + B + C). The **False Positive Rate** = C / (A + B + C).

This is computable entirely in silico. Experimental validation is reserved for Category B predictions — the genuine frontier. The A:B:C ratio directly characterizes the nature of IMAGINE-AI's advantage and the trustworthiness of its novel predictions.

---

## 6. Metrics for Quantifying AI Advantage

### Phase 1 Metrics

---

**Predictive Accuracy Advantage (PAA)**: Macro-averaged F1 (categorical) and RMSE (quantitative) for IMAGINE-AI versus reproduced traditional models on identical held-out test taxa (10-fold stratified CV × 10 repeats). Computed per trait class. Decision gate: ≥5 pp F1 or ≥10% RMSE improvement (permutation test, p < 0.05). Computed against both reproduced traditional baselines and the "comps" published performance values.

**Scaling Exponent (SE)**: Fit Performance(n) = a·n^α + c over bootstrapped training subsets (10%, 25%, 50%, 75%, 100%). Compare α for IMAGINE-AI versus traditional models trained on the same subsets. Both models are fit to the same data at each subset size — this is a direct comparison, not against an arbitrary benchmark. A higher α means the model extracts more information per additional training example. Extension: compute SE at increasing biological complexity (pure culture → consortia) to test whether AI advantage amplifies with problem difficulty.

**Prediction Frontier Expansion (PFE)**: Fraction of organisms where IMAGINE-AI produces a confident prediction (probability ≥ 0.8) but the best traditional baseline produces no prediction or unacceptable uncertainty. False positive control via Reciprocal Confirmation Protocol: PFE predictions undergo Category A/B/C scoring. Only Category A+B predictions count toward PFE; Category C predictions are subtracted. PFE-validated = (A+B) / total organisms.

**Interaction Discovery Rate (IDR)**: Fraction of gene-gene or species-species interactions identified by AI (GNN edge importance, transformer attention) that are not detectable by traditional pairwise tests at p < 0.10, scored via Reciprocal Confirmation Protocol. Category A interactions (confirmed when GLMM is given the specific term) demonstrate discovery speed advantage; Category B interactions demonstrate capability expansion.

**Uncertainty Calibration Index (UCI)**: Reliability diagram across confidence bins ([0.5–1.0] in 0.1 steps). Ground truth = actual phenotype labels from BacDive/µGrowthDB held-out test organisms. UCI = 1 − mean |observed_accuracy − expected_confidence| across bins. These organisms have experimentally determined phenotypes — they are the calibration standard. Decision gate: UCI_AI ≥ 0.85.

**Workflow Efficiency Quotient (WEQ)**: Absolute throughput measurement: wall-clock time for IMAGINE-AI's agentic workflow to go from raw genome input to validated phenotype predictions, measured across the 20 comparable studies' datasets. Rather than estimating human person-months (not reliably reported in publications), we report AI-agent time as a standalone metric and compare it against publication-to-publication turnaround: the calendar time between data deposition dates and publication dates for comparable studies, which is recoverable from public database timestamps and journal records. This provides an upper-bound estimate of human analytical timelines without requiring person-month reporting.

**Consortia Emergence Score (CES)**: CES = Corr(AI_predicted_consortia_phenotype, observed) − Corr(additive_pure_culture_sum, observed). Phase 1 evaluates on existing PI/Co-PI consortia datasets and in silico composites. A positive CES means the AI captures team effects that additive models miss.

---

### Phase 2 Metrics

---

**Dark Matter Illumination Rate (DMIR)**: Fraction of proteins with no detectable homology to characterized proteins (40–60% of environmental sequences; Pavlopoulos et al. 2023) that IMAGINE-AI assigns confident functional predictions via protein language model embeddings. False positive control via Reciprocal Confirmation: AI-predicted functions are used to design targeted HMM/PSI-BLAST searches. Category A = weak homology surfaces when you know where to look. Category C = no signal even with targeted search AND contradicted by structural prediction. DMIR is reported with its RCR.

**Compositional Fidelity Score (CFS)**: False discovery rate from compositionality violations in differential abundance testing. Evaluated on synthetic communities with known structure (Dirichlet-multinomial generative model). CFS = 1 − FDR from compositional artifacts. AI methods learning distributional properties directly (VAEs, Dirichlet-multinomial neural models) should exceed traditional methods (DESeq2, LEfSe) which show <25% cross-method concordance (Nearing et al. 2022).

**Cross-Biome Generalization Index (CBGI)**: Performance on held-out biomes not in training data, normalized to training-biome performance. Models trained on BacDive/µGrowthDB (culture-enriched) tested on soil, marine, and subsurface metagenomes from NMDC. CBGI near 1.0 = robust generalization; below 0.5 = overfitting.

**Discovery Throughput Index (DTI)**: Novel validated findings per unit compute-time (not per "effort," which conflates unmeasurable quantities). Findings qualify as novel if absent from training databases, not predicted by traditional pipelines, and scored Category A or B via Reciprocal Confirmation. DTI = validated_novel_findings / GPU-hours. This separates the productivity question (how many discoveries?) from the efficiency question (at what computational cost?) without requiring human-effort estimation.

**Curation Efficiency Ratio (CER)**: Ontology-compliance improvement rate comparing AI-assisted versus rule-based data harmonization, measured on a standardized test set of BioSample records with known correct ontology mappings. CER = accuracy_improvement / processing_time.

**Hypothesis Novelty Yield (HNY)**: Fraction of AI-generated hypotheses that are Category A (confirmed by traditional methods when given the specific hypothesis) or Category B (beyond traditional confirmation, validated experimentally). HNY is computed over the full DBTL experimental output in Phase 2.

---

### Phase 1 Decision Gate Summary

| Metric | Go Threshold | Evidence |
|--------|-------------|----------|
| PAA | ≥5 pp F1 or ≥10% RMSE improvement (p<0.05) | Held-out test taxa, 10×10 CV |
| SE | α_AI > α_trad (p<0.05) on same data subsets | Bootstrap subsets, both models |
| PFE | >0% expansion, RCR ≥ 0.70 | Reciprocal Confirmation scoring |
| IDR | ≥3 Category A or B interactions | GNN/attention + reciprocal confirmation |
| UCI | ≥ 0.85 | BacDive/µGrowthDB held-out phenotypes |
| WEQ | Reported (absolute throughput) | 20 study datasets, wall-clock measurement |
| CES | CES > 0 (p<0.05, bootstrap CI) | PI/Co-PI existing consortia data |

---

## 7. Component Contribution Analysis

To determine which AI components drive advantage, systematic runs remove individual components while holding everything else constant:

| Condition | What's Removed | What It Tests |
|-----------|---------------|---------------|
| Full IMAGINE-AI | Nothing | Upper bound |
| −Foundation models | ESM embeddings → one-hot encoding | Value of learned representations |
| −GNN | Graph networks → independent feature vectors | Value of interaction modeling |
| −Multi-omics | Genomics only | Value of data integration |
| −Agentic workflow | Manual pipeline, same models | Value of AI-managed workflow |
| Traditional baseline | Logistic regression / GLMM only | Lower bound |

Each condition is evaluated on the full metrics suite. This answers not just *whether* AI is better but *which components matter and by how much* — directly informing Phase 2 investment priorities.

---

## 8. Experimental Validation

A subset of AI-unique predictions should be experimentally validated, prioritizing Category B predictions (beyond traditional confirmation):

- **Phenotype predictions**: Growth assays under predicted conditions (temperature, pH, oxygen, salt) — integrated with high-throughput phenotyping protocols (Objective B)
- **Functional annotations**: Heterologous expression or knockout experiments for predicted enzyme activities
- **Ecological associations**: Controlled co-culture experiments testing predicted consortia interactions — integrated with the DBTL cycle

---

## 9. Data Sources and Models

**Genotypic**: IMG (>450K prokaryotic genomes), NCBI RefSeq (23,063 species-representative assemblies), NFixDB (>4,000 nitrogenase gene clusters across 50 phyla). **Taxonomic Reference**: LLNL decontaminated Centrifuge databases (Marti et al. 2025; 1.0–1.4 trillion nucleotides). **Phenotypic**: BacDive (>100,000 strains), µGrowthDB (quantitative growth rates). **Integrated**: PI/Co-PI datasets — growth phenotypes (n=1,420), metatranscriptomes (n=590), metaproteomes (n=117), sequenced genomes and metagenomes.

**AI Models**: ESM-style protein/genome language models; AtomGPT-style domain-adapted models (Choudhary 2024, *JPCL*); GNNs for interaction networks building on the ALIGNN architecture (Choudhary 2021, *npj Comp. Mat.*); multimodal deep learning; ensemble gradient boosting. Cross-property transfer learning (Choudhary 2021, *Sir. Commun.*) addresses the small-dataset problem for scarce phenotypes like N₂ fixation rates: pre-train on abundant phenotype classes (growth rate, Gram stain) and fine-tune on scarce targets. Agentic workflows via AtomGPT.org APIs, AGAPI agents, and MCP-based integrations.

**Team-Generated Data**: PI/Co-PI datasets with growth phenotypes (n=1,420), metatranscriptomes (n=590), metaproteomes (n=117), sequenced genomes/metagenomes for consortia members, per-taxon qSIP growth rates across nutrient gradients (Greenlon et al. 2022), per-taxon ¹⁵N assimilation rates (Maillard et al. 2025), in situ CUE measurements (Pett-Ridge et al. 2022, *Sci. Adv.*), and global-biome activity data (Blazewicz et al. 2023, *Sir. Microbiol.*). qSIP data follows the MISIP community standard (Maillard et al. 2024, *GigaScience*).

**Benchmarking Reference Set**: 20 published studies (2020–2026) organized into three module types (categorical classifiers, growth rate predictors, mechanistic models) providing independent performance baselines across all IMAGINE-AI phenotype categories except fatty acid composition (identified gap — no published ML study found).

---

## References

### External Benchmark Studies (Comps)
1. Koblitz et al. (2025) *Commun. Biol.* 8:527 — Multi-trait ML phenotype prediction from BacDive
2. Bizzotto et al. (2024) *Environ. Microbiome* 19:62 — MICROPHERRET, 86 metabolic traits incl. N₂ fixation
3. Karaoz & Brodie (2022) *Front. Bioinform.* 2:918853 — microTrait, soil bacterial traits
4. Li et al. (2023) *PLoS Comput. Biol.* 19:e1011705 — Carbon source utilization prediction
5. Weissman et al. (2021) *PNAS* 118:e2016810118 — gRodon, max growth rate from CUB
6. Xu et al. (2025) *Sir. Commun.* 16:4226 — Phydon, phylogeny-informed growth rate
7. Gralka et al. (2023) *Sir. Microbiol.* 8:1799 — Carbon catabolic preferences from genome content
8. Geller-McGrath et al. (2024) *eLife* 13:e85749 — MetaPathPredict, KEGG modules in incomplete MAGs
9. Ramoneda et al. (2023) *Sci. Adv.* 9:eadf8998 — Genome-based bacterial pH preferences
10. Osburn et al. (2024) *Sir. Commun.* 15:6853 — Global soil bacterial growth potential
11. Machado et al. (2025) *PeerJ* 13:e20232 — SpoMAG, sporulation prediction in MAGs
12. Flamholz et al. (2024) *mSystems* 9:e00763-24 — Annotation-free O₂ utilization prediction
13. Wan et al. (2025) *Genomics* 117:111095 — O₂ preference from Pfam domains
14. Liu et al. (2025) *BMC Genomics* 26:304 — Optimal growth temperature from Pfam
15. Long et al. (2021) *ISME J.* 15:183 — Growth rate benchmark, marine MAGs
16. Weissman et al. (2022) *mSystems* 7:e00745-22 — gRodon MMv2, community growth from metagenomes
17. Joseph et al. (2022) *Genome Res.* 32:558 — CoPTR, in situ growth rate from PTR
18. Gomez-Perez & Keller (2025) *NAR Genom. Bioinform.* 7:lqaf174 — NLP4Pheno, NLP+genome phenotype prediction

### IMAGINE-AI Team Publications (Internal Benchmarks and Foundations)
19. Marschmann, Pett-Ridge et al. (2024) *Sir. Microbiol.* 9:421 — Genome-informed trait-based energy budget, rhizosphere
20. Blazewicz, Morrissey, Pett-Ridge et al. (2025) *PNAS* 122:e2413032122 — CUB growth rate vs ¹⁸O-SIP in soil
21. Morrissey et al. (2024) *Environ. Microbiol.* 26:e16580 — Genomic traits predict CUE
22. Campbell & Morrissey (2022) *Environ. Microbiol.* 24:5900 — Substrate assimilation phylogenetically conserved
23. Morrissey et al. (2023) *ISME Commun.* 3:71 — Evolutionary history shapes ecology of soil bacteria
24. Schwartz & Blazewicz (2022) *mBio* 13:e02562-22 — Genomic features enabling life history strategies
25. Greenlon, Hofmockel, Blazewicz, Pett-Ridge, Kimbrel et al. (2022) *mSystems* 7:e00105-22 — qSIP + MAGs across N/P gradients
26. Blazewicz, Morrissey, Pett-Ridge et al. (2023) *ISME J.* 17:1268 — Life history traits across habitats
27. Blazewicz et al. (2023) *Sir. Microbiol.* 8:2042 — Global biome microbial activity heterogeneity
28. Pett-Ridge et al. (2022) *Sci. Adv.* 8:eabp8798 — In situ CUE measurements
29. Maillard, Blazewicz, Kimbrel, Pett-Ridge et al. (2025) *AEM* 91:e01648-24 — Per-taxon ¹⁵N assimilation via qSIP
30. Wilhelm & Hofmockel (2022) *AEM* 88:e01022-22 — Free-living diazotroph BNF metabolomics
31. Kimbrel et al. (2025) *ISME J.* 19:1 — Biofertilizer SynCom genomic compatibility
32. Kimbrel et al. (2023) *PLOS One* 18:e0291180 — Biofertilizer PGP trait spectrum
33. Brzostek & Morrissey et al. (2024) *GCB* 30:e17181 — N deposition alters microbial traits

### AI/ML Architecture (Choudhary, JHU — Methodological Transfer)
34. Choudhary (2021) *Sir. Commun.* 12:6560 — Cross-property transfer learning for small datasets
35. Choudhary (2024) *JPCL* 15:6792 — AtomGPT, transformer forward/inverse property prediction
36. Choudhary (2021) *npj Comp. Mat.* 7:185 — ALIGNN, graph neural network for property prediction

### Data Infrastructure and Standards
37. Marti et al. (2025) *mSystems* DOI:10.1128/msystems.01239-24 — Decontaminated Centrifuge databases
38. Maillard, Pett-Ridge et al. (2024) *GigaScience* 13:giae078 — MISIP data standard for qSIP
39. Reimer et al. (2025) *Bioinform. Adv.* 5:vbaf021 — LLM metadata harmonization

### Conceptual and Methodological References
40. Pavlopoulos et al. (2023) *Nature* 622:594 — Functional dark matter (40–60%)
41. Nearing et al. (2022) *Sir. Commun.* 13:342 — <25% DA method concordance
42. Karlsen et al. (2023) *FEMS Microbiol. Rev.* 47:fuad025 — Phenotype prediction structural gaps
43. Birhane et al. (2023) *Sir. Rev. Phys.* 5:277 — Three-level AI advantage framework
44. Gao et al. (2024) *Sir. Hum. Behav.* / arXiv:2304.10578 — 3.02× AI publication rate
45. Gloor et al. (2017) *Front. Microbiol.* 8:2224 — Compositionality violations
46. Wang et al. (2024) *Genome Biol.* 25:34 — AnnoPRO protein annotation

---

*IMAGINE-AI Metrics Framework v4.0 — 2026-04-16*
