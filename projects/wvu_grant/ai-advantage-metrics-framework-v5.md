# IMAGINE-AI Metrics and Comparative Advantage Framework

**Supplementary material for co-PI review — ideas for integration into the Drafting Narrative**

---

## 1. Three Levels of AI Advantage

**Throughput amplification** — agentic accelration of pipeline decision making, iteration, review and revision.

**Quality enhancement** — increased prediction accuracy from the same data or as the result of improved data gathering and curation.

**Latent pattern discovery** — finding new dots to connect across multi-omic data, revealing patterns where other methods structurally fail.

---

## 2. Five Dimensions of AI Advantage

### D1: Feature Representation — From Annotations to Learned Embeddings

Sequence pattern and annotation methods use features that miss unknown proteins and other elements with no database annotation. Protein language models (ESM-style) learn representations directly from sequence, capturing structural and functional signals in unannotated regions.

### D2: Interaction Modeling — From Independent Features to Network Awareness

GLMM treats genomic features as independent predictors. Gene-gene interactions, pathway synergies, and regulatory cross-talk are structurally invisible to additive models. GNNs and transformer attention model these explicitly.

### D3: Scale and Integration — From Single-Omics to Multi-Modal Fusion

Traditional approaches analyze one data type at a time with post-hoc human integration. Multimodal deep learning jointly models genomics, transcriptomics, metabolomics, and environment in a single representation space.

### D4: Data Quality — From Manual Curation to AI-Assisted Harmonization

Database bias introduces spurious classifications (Marti et al. 2025). LLNL's decontaminated Centrifuge indices (1.0–1.4 trillion nt) address this. AI-assisted harmonization (LLM ontology mapping, neural imputation) breaks the curation bottleneck.

### D5: Community Prediction — From Additive Assembly to Emergent Behavior

Summing individual organism contributions fails when community phenotype depends on inter-species interactions. AI models on interaction-aware representations capture these "team effects."

---

## 3. What AI Mechanistically Does That Traditional Methods Cannot

If Random Forest on Pfam features already achieves F1 0.89–0.97 (Koblitz et al. 2025), what does IMAGINE-AI add? Not only better classifiers, also mechanistically distinct capabilities.

### 3.1 Learned Representations vs. Curated Annotations

Pfam-based models see only annotated proteins. ESM-2 embeddings generate vectors for any sequence — annotated or not — capturing fold, binding geometry, and evolutionary conservation from billions of sequences. This is a different feature space, not a better classifier on the same features.

### 3.2 Implicit Combinatorial Interaction Search

With 20,000 Pfam domains there are ~200M possible pairwise interactions. GLMM can test a handful; multiple testing correction destroys power for exhaustive search. GNNs learn which interactions matter from graph structure by implicit search that linear methods can't approximate.

### 3.3 Adaptive Methodological Decision-Making

Traditional pipelines are static. Agentic AI workflows make runtime decisions: adjusting preprocessing, selecting architectures, iterating feature engineering, and searching literature based on intermediate results. The process is adaptive, not just the model.

### 3.4 Semantic Reasoning Over Unstructured Knowledge

LLMs extract features from unstructured text (gene descriptions, literature, pathway docs) and use semantic content alongside numerical features (cf. NLP4Pheno, Gomez-Perez & Keller 2025). Traditional methods operate on structured features only.

### 3.5 Cross-Property Transfer Learning

Traditional ML trains independently per phenotype. Cross-property transfer (Choudhary 2021, *Nat. Commun.*) pre-trains on abundant phenotypes then fine-tunes on scarce targets — transferring structural knowledge from data-rich to data-poor domains. Directly applicable: growth rate data is abundant, N₂ fixation data is scarce.

---

## 4. Retrospective Benchmarking

We benchmark IMAGINE-AI against published G2P studies with known outcomes, running the same data through our pipeline and comparing result quality. This produces two types of evaluation:

- **Direct comparison** (PAA, SE, WEQ): accuracy, scaling, and throughput measured against published performance values on the same data.
- **Novel discovery validation** (PFE, IDR, FPDR): AI-unique predictions — findings that go beyond what the original study reported — are scored using the Reciprocal Confirmation Protocol (§5).

### Comparable Studies (~5 per module)

**Module A — Categorical Phenotype Classifiers**

| Study | Phenotype | Performance | Notes |
|-------|-----------|-------------|-------|
| Koblitz et al. 2025, *Commun. Biol.* | Gram, motility, spore, O₂, temp | F1 0.89–0.97 | BacDive; closest IMAGINE-AI analog |
| Bizzotto et al. 2024, *Environ. Microbiome* (MICROPHERRET) | 86 traits incl. N₂ fixation | MCC 0.92 (N-fix) | Covers N-fix use case |
| Li et al. 2023, *PLoS Comput. Biol.* | Carbon source utilization | AUROC 0.81 | Nutritional strategy |
| Campbell & Morrissey 2022, *Environ. Microbiol.* | Substrate assimilation (qSIP) | Per-taxon rates | **Team** |
| Kimbrel et al. 2025, *ISME J.* | SynCom colonization | Establishment prediction | **Team** |

**Module B — Growth Rate Predictors**

| Study | Scope | Performance | Notes |
|-------|-------|-------------|-------|
| Xu et al. 2025, *Nat. Commun.* (Phydon) | Max growth rate | r=0.93 | Current SOTA |
| Weissman et al. 2021, *PNAS* (gRodon) | Max growth rate from CUB | r=0.84 | Foundation method |
| Blazewicz, Morrissey, Pett-Ridge et al. 2025, *PNAS* | Soil growth vs ¹⁸O-SIP | r²=0.61 | **Team**; gold-standard validation |
| Greenlon et al. 2022, *mSystems* | qSIP across N/P gradients | Per-taxon rates | **Team** (4 Co-PIs) |
| Osburn et al. 2024, *Nat. Commun.* | Global soil growth potential | r²=0.62 | Soil; environmental covariates |

**Module C — Mechanistic/Trait-Based and Community Models**

| Study | Scope | Performance | Notes |
|-------|-------|-------------|-------|
| Marschmann, Pett-Ridge et al. 2024, *Nat. Microbiol.* | CUE, substrate kinetics | r²=0.85 | **Team**; genome traits → DEB |
| Morrissey et al. 2024, *Environ. Microbiol.* | CUE from genomic traits | G2P correlation | **Team**; IMAGINE-AI proof-of-concept |
| Schwartz & Blazewicz 2022, *mBio* | Genome → life history strategy | Feature identification | **Team** |
| Gralka et al. 2023, *Nat. Microbiol.* | Carbon catabolic preferences | Acc 82%, AUROC 0.88 | CAZyme features |
| Geller-McGrath et al. 2024, *eLife* (MetaPathPredict) | KEGG modules in incomplete MAGs | AUROC 0.92, F1 0.88 | Handles incomplete genomes |

Improvement over team-authored baselines is the most credible evidence for AI advantage — it addresses methodology or dataset artifacts.

---

## 5. Reciprocal Confirmation: Validating Novel Discoveries

When IMAGINE-AI produces predictions beyond what the original study reported, those novel discoveries need validation. "Finding more" is indistinguishable from "hallucinating more" without a principled scoring method. The Reciprocal Confirmation Protocol provides this by using traditional methods as a validation layer — and, bidirectionally, using AI to flag potential false positives in traditional results.

### Forward Direction: Validating AI Discoveries

Each AI-unique prediction is reformulated as a targeted hypothesis for traditional methods:

| AI Discovery Type | Reciprocal Confirmation |
|---|---|
| Phenotype prediction for organism X | Fit GLMM with features AI identified; test significance |
| Gene-gene interaction | Add specific interaction term to GLMM; test significance |
| Consortia emergence | Fit additive model + AI-identified non-additive term; test fit improvement |
| Functional annotation | Use AI-predicted function for targeted PSI-BLAST/HMM search |

- **Category A — Confirmed**: Traditional confirms when pointed at the hypothesis. AI advantage = discovery speed.
- **Category B — Unconfirmable**: Traditional lacks power to test. AI advantage = capability expansion. Candidates for experimental validation.
- **Category C — Refuted**: Traditional contradicts. False positive.

**RCR** = A / (A + C). **Capability Expansion Fraction** = B / (A + B + C).

### Reverse Direction: AI Detecting Traditional False Positives

**Confound detection**: When traditional methods assign high importance to a feature but AI models (in ESM embedding space, independent of phylogenetic correlation) assign low importance, this flags potential confound-driven false positives.

**Multi-representation consistency**: Findings that hold in only one feature space (e.g., Pfam but not KEGG or ESM) may be artifacts of feature construction — cross-paradigm validation, not just cross-data-split validation.

**Calibrated uncertainty disagreement**: Where traditional methods predict confidently but a calibrated AI model shows high uncertainty, the traditional prediction may be in an under-sampled or confounded region.

- **Category D1**: Independent evidence supports AI's rejection. Traditional finding was false positive.
- **Category D2**: Inconclusive.
- **Category D3**: Independent evidence supports traditional finding. AI rejection was wrong.

### Statistical Safeguards

- Pre-specify disagreement criteria before running either method
- Resolve disagreements via independent evidence, not self-evaluation
- Report the full A:B:C:D1:D2:D3 distribution as a result
- Use held-out sets unseen by both methods

---

## 6. Metrics

### Phase 1 (Decision Gate)

**PAA** — F1/RMSE improvement over baselines and comps. Gate: ≥5 pp F1 or ≥10% RMSE (p<0.05). *In Draft Narrative.*

**SE** — Scaling exponent: performance vs. training size for AI and traditional on same subsets. *In Draft Narrative. New: compute at increasing biological complexity.*

**PFE** — Prediction Frontier Expansion: organisms where AI predicts but traditional cannot. Controlled via Reciprocal Confirmation. *New.*

**IDR** — Interaction Discovery Rate: AI-found interactions not detectable by pairwise tests, scored A/B/C. *New.*

**UCI** — Uncertainty Calibration: confidence vs. accuracy on held-out phenotypes. Gate: ≥0.85. *New.*

**WEQ** — Workflow Efficiency: IMAGINE-AI wall-clock time vs. data-deposition-to-publication calendar time for comps. *Refines Draft Narrative metric.*

**CES** — Consortia Emergence Score: AI consortia prediction correlation minus additive-sum correlation. Gate: >0 (p<0.05). *New.*

**FPDR** — False Positive Detection Rate: traditional findings flagged by AI disagreement, confirmed via independent evidence (Category D1). *New.*


### Decision Gate Summary

| Metric | Go Threshold | Evidence |
|--------|-------------|----------|
| PAA | ≥5 pp F1 or ≥10% RMSE (p<0.05) | Held-out taxa, 10×10 CV |
| SE | α_AI > α_trad (p<0.05) | Bootstrap subsets |
| PFE | >0%, RCR ≥ 0.70 | Reciprocal Confirmation |
| IDR | ≥3 Category A or B interactions | GNN/attention + confirmation |
| UCI | ≥ 0.85 | Held-out phenotypes |
| WEQ | Reported | Comps datasets |
| CES | > 0 (p<0.05) | PI/Co-PI consortia data |
| FPDR | Reported (D1/D2/D3 distribution) | Disagreement analysis |

---

## 7. Component Contribution Analysis (Future Work)

Systematic removal of individual AI components (embeddings, GNN, multi-omics, agentic workflow) would reveal which drive advantage. Phase 1 tracks contributions qualitatively via interpretability (attention weights, SHAP). Formal analysis recommended for Phase 2.

## 8. Experimental Validation (Phase 1 Scope)

Limited to planned high-throughput phenotyping: growth rates and metabolites in mono/consortia cultures under N-free conditions, with Horiba A-TEEM fingerprinting. DBTL cycle predictions (Month 9) evaluated against these measurements. Broader Category B validation held for Phase 2.

## 9. Supplementary Data Sources

**Taxonomic backbone**: LLNL decontaminated Centrifuge databases (Marti et al. 2025).
**Transfer learning**: Choudhary (2021) cross-property approach — pre-train on growth rate, fine-tune on N₂ fixation.
**Data standards**: Team qSIP follows MISIP (Maillard et al. 2024).
**Benchmarking set**: 15 studies, 3 modules, 5 team-authored.

---

## References

### Benchmark Studies
1–9: Koblitz 2025; Bizzotto 2024; Li 2023; Xu 2025; Weissman 2021; Osburn 2024; Gralka 2023; Geller-McGrath 2024; Gomez-Perez 2025

### Team Publications
10–21: Marschmann 2024; Blazewicz 2025 PNAS; Morrissey 2024; Campbell 2022; Morrissey 2023; Schwartz 2022; Greenlon 2022; Blazewicz 2023 ISME J; Wilhelm 2022; Kimbrel 2025; Maillard 2025; Pett-Ridge 2022

### AI/ML Architecture
22–24: Choudhary 2021 Nat Commun; Choudhary 2024 JPCL; Choudhary 2021 npj CM

### Data Infrastructure
25–26: Marti 2025; Maillard 2024 GigaScience

### Conceptual
27–31: Pavlopoulos 2023; Nearing 2022; Karlsen 2023; Birhane 2023; Gloor 2017

---

*IMAGINE-AI Metrics Framework v5.1 — 2026-04-16*
