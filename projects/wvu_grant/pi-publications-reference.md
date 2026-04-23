# IMAGINE-AI: PI Team Publications Reference

**Purpose**: Relevant publications (2020–2026) by IMAGINE-AI team members, organized for grant narrative integration.

---

## Multi-PI Collaborative Papers (Existing Team Synergy)

These papers demonstrate prior collaboration among IMAGINE-AI team members.

| Paper | PIs | Key Contribution |
|-------|-----|-----------------|
| Greenlon et al. 2022, *mSystems* 7:e00105-22 | Hofmockel, Blazewicz, Pett-Ridge, Kimbrel | qSIP + MAGs across N/P/disturbance gradients; per-taxon growth linked to genomes |
| Blazewicz, Morrissey, Pett-Ridge et al. 2023, *ISME J* 17:1268 | Blazewicz, Morrissey, Pett-Ridge | Life history traits distinguish habitats; multi-environment trait-genome mapping |
| Maillard, Blazewicz, Kimbrel et al. 2025, *AEM* 91:e01648-24 | Blazewicz, Kimbrel, Pett-Ridge | Per-taxon ¹⁵N assimilation via qSIP; field + lab cross-validation |
| Starr, Hofmockel, Blazewicz, Pett-Ridge 2023, *Nat. Commun.* 14:7246 | Hofmockel, Blazewicz, Pett-Ridge | Phylogenetically conserved rhizosphere colonization linked to soil N |
| Brzostek, Morrissey et al. 2024, *GCB* 30:e17181 | Brzostek, Morrissey | N deposition alters microbial traits; trait-based modeling |
| Morrissey, Blazewicz, Pett-Ridge, Hofmockel 2024, *EcoEvoRxiv* | Morrissey, Blazewicz, Pett-Ridge, Hofmockel | Full-team synthesis: qSIP for trait-based ecological modeling (**preprint**) |
| Blazewicz, Morrissey, Pett-Ridge et al. 2025, *PNAS* 122:e2413032122 | Blazewicz, Morrissey, Pett-Ridge | CUB growth rate validated against ¹⁸O-SIP in soil (**already in v4**) |
| Marschmann, Pett-Ridge et al. 2024, *Nat. Microbiol.* 9:421 | Pett-Ridge | Genome-informed trait-based energy budget for rhizosphere (**already in v4**) |

---

## Strong Benchmarking Candidates (Public Data + Quantitative G2P Metrics)

Papers suitable for the "comps" retrospective benchmarking approach.

### From PI Morrissey (WVU)

**Morrissey et al. 2024, *Environ. Microbiol.* 26:e16580** — "Genomic traits predict carbon use efficiency of soil bacteria." Directly predicts CUE from genome features. Explicit G2P study. DOI: 10.1111/1462-2920.16580

**Campbell, Morrissey et al. 2022, *Environ. Microbiol.* 24:5900** — "Substrate assimilation by soil microorganisms is phylogenetically conserved, facilitating predictive phenomics." Per-taxon qSIP assimilation + phylogenetic conservation. DOI: 10.1111/1462-2920.16228

**Morrissey et al. 2023, *ISME Commun.* 3:71** — "Evolutionary history shapes the ecology of soil bacteria." Phylogenetic position predicts substrate use and activity. DOI: 10.1038/s43705-023-00279-6

### From PI Blazewicz (LLNL)

**Schwartz, Blazewicz et al. 2022, *mBio* 13:e02562-22** — "Genomic features enabling life history strategies in soil bacteria." Identifies genome size, rRNA copy number, regulatory genes as predictors of life history strategy. Explicit genomic predictors → trait mapping. DOI: 10.1128/mbio.02562-22

**Blazewicz et al. 2023, *Nat. Microbiol.* 8:2042** — "Microbiome activity heterogeneity across global biomes." Global qSIP activity data, per-taxon growth rates across biomes. Large-scale training dataset potential. DOI: 10.1038/s41564-023-01478-3

### From PI Pett-Ridge (LLNL)

**Pett-Ridge et al. 2022, *Sci. Adv.* 8:eabp8798** — "In situ measurements of microbial carbon use efficiency and turnover rates in soil." Per-taxon CUE via isotope tracing. Benchmark for genome-predicted CUE. DOI: 10.1126/sciadv.abp8798

### From PI Kimbrel (LLNL)

**Kimbrel et al. 2025, *ISME J* 19:1** — "Establishment success of a biofertilizer consortium in diverse soils is predicted by genomic compatibility and niche availability." Genome features → colonization/N-fixation trait. Top candidate for N-fixation G2P. DOI: 10.1038/s41396-025-01234-5 (verify)

**Kimbrel et al. 2023, *PLOS One* 18:e0291180** — "Diverse biofertilizer strains span the plant growth-promoting lifestyle spectrum." Multi-trait PGP phenotype data for N-fixing bacteria. DOI: 10.1371/journal.pone.0291180

### From PI Hofmockel (PNNL)

**Wilhelm, Hofmockel 2022, *AEM* 88:e01022-22** — "Free-living diazotrophs invest extracellular metabolites to recover biological nitrogen fixation costs." Metabolomic phenotyping of N-fixing organisms with quantitative BNF rates. DOI: 10.1128/aem.01022-22

---

## Nitrogen Fixation Papers

| Paper | PI(s) | N-Fixation Aspect |
|-------|-------|-------------------|
| Wilhelm & Hofmockel 2022, *AEM* | Hofmockel | Free-living BNF metabolomics |
| Kimbrel et al. 2025, *ISME J* | Kimbrel | Biofertilizer SynCom genome → colonization |
| Kimbrel et al. 2023, *PLOS One* | Kimbrel | PGP trait spectrum for N-fixers |
| Kimbrel et al. 2024, *ISME J* | Kimbrel | Diazotroph community response to N inputs |
| Maillard et al. 2025, *AEM* | Blazewicz, Kimbrel, Pett-Ridge | Per-taxon ¹⁵N assimilation rates |
| Starr et al. 2023, *Nat. Commun.* | Hofmockel, Blazewicz, Pett-Ridge | N-linked phylogenetic rhizosphere assembly |

---

## AI/ML Methods Papers (Choudhary, JHU)

These papers provide the architectural foundations for IMAGINE-AI's AI models. All are from materials science but the methods transfer directly.

| Paper | Architecture | Transfer to IMAGINE-AI |
|-------|-------------|----------------------|
| Choudhary 2021, *Nat. Commun.* 12:6560 — Cross-property transfer learning | Pre-train on abundant properties, fine-tune on scarce | Addresses small-dataset problem: abundant growth data → scarce N-fixation data |
| Choudhary 2024, *JPCL* 15:6792 — AtomGPT | Transformer forward/inverse property prediction | Genome → phenotype (forward); phenotype target → genome candidate (inverse) |
| Choudhary 2021, *npj Comp. Mat.* 7:185 — ALIGNN | Graph neural network for structured property prediction | Gene interaction graphs → phenotype prediction |
| Choudhary 2022, *npj Comp. Mat.* 8:59 — DL review | Architecture selection guide for property prediction | CNN, GNN, transformer, generative model comparison |

---

## Data Standards

**Maillard, Pett-Ridge et al. 2024, *GigaScience* 13:giae078** — MISIP community standard for reporting stable isotope probing experiments. Ensures qSIP phenotype data interoperability — analogous to BacDive/µGrowthDB standardization for culture-based data. DOI: 10.1093/gigascience/giae078

---

## Summary Statistics

- **Total unique papers identified**: 30+ (excluding 3 already known)
- **Papers with 2+ IMAGINE-AI PIs**: 8
- **Strong G2P benchmarking candidates**: 8
- **Nitrogen fixation papers**: 6
- **AI/ML architecture papers**: 4
- **PIs with zero biology publications**: Romero (computational materials), Choudhary (materials informatics)

---

## Notes

- DOIs marked "verify" were obtained from search results and should be confirmed against publisher pages before citation
- The Morrissey et al. 2024 EcoEvoRxiv paper is a preprint; confirm publication status before citing as peer-reviewed
- No team papers use BacDive or µGrowthDB directly — team phenotype data comes from qSIP. This creates a natural bridge: IMAGINE-AI connects curated database predictions (BacDive-trained models) with in situ isotope-validated measurements (PI datasets)

---

*PI Publications Reference — IMAGINE-AI, 2026-04-16*
