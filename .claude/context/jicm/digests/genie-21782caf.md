# Working Details — .scratchpad.genie.md

## Literature Mining Workflow Scope

### Gold Set Assembly
- **Curated gold set**: 39 papers from Europe PMC API, stratified by failure mode
  - 13 known truth papers (already adjudicated in ARA audit)
  - 14 positive cases (ARA discussed and numeric rates present)
  - 12 hard negatives (ARA discussed but no extractable rates)
- **Screening results**: 31 papers with retrievable full text, 24 carrying tables
  - 14 usable positives, 25 hard negatives, 30 off-topic
  - Species descriptions (e.g., *Fontibacillus forbon*, *Paenibacillus haidiansis*) often mention ARA but report no numeric rates
  - 13 seed papers provide ground truth for validation

### Workflow Design
- **Design commitment**: Paper-level subject resolution before extraction
  - Resolves the issue of values being bound to organisms named nearby rather than the paper's actual subject
- **Nine-stage workflow**:
  1. Seed (764 NFixDB diazotrophs + shortlist)
  2. Acquire (Europe PMC OA XML; GROBID for PDF-only)
  3. Segment (sections/tables/captions kept separate)
  4. Subject (resolve organisms the paper is about via TaxoNERD → NCBI taxid)
  5. Extract (schema-constrained with verbatim evidence span + table/cell reference)
  6. Verify (span exists in source, unit parses, value within physical bounds, organism is a subject)
  7. Adjudicate (independent second pass; disagreements to a third)
  8. Normalize (canonical basis with conversion provenance)
  9. Emit (confidence tier + full provenance chain)

### Cost and Staging
- **Phase A - Validate**: 39 gold papers, full pipeline, report precision/recall per stratum (~150–250 agent invocations)
- **Phase B - Pilot**: ~100 papers over alt-nitrogenase organisms + shortlist (~400–600 agent invocations)
- **Phase C - Production**: 764 NFixDB diazotrophs (~2,000–4,000 agent invocations)

### Expected Outcomes
- **Low volume, high quality**: A few dozen high-confidence rates rather than hundreds
- **Value in verification**: Each surviving row would carry a verified span, resolved taxon, parsed unit, and provenance chain
- **Precision threshold**: If Phase A shows precision below ~0.8 on the seeds, redesign is necessary

### Pending Decisions
1. **Is a few dozen verified rates worth Phase C?** This is a scientific call about whether the bench will produce better data in six months.
2. **Who confirms the gold set?** The gold set needs independent evaluation rather than being built and graded by the same person.

## Team Repo Verification and Data Health

### Clone Verification
- **Clone status**: `origin/main` at `633af01`, 0 commits behind, clean tree, no Git LFS
- **Tracked files**: 186 files, 69 data files profiled

### Critical Findings
- **Accession join issues**: Four identifier conventions in use (NFixDB, master matrix, growth rates, NFixDB `genome_id`)
  - Reduce all to the core and they work: master→NFixDB 7.2%, growth-rate→NFixDB 18.0%, curated rates→NFixDB 66.7%, ProTraits→NFixDB 100%
  - NFixDB's choice is the correct one and should be adopted everywhere
- **BacDive fill table issue**: `ncbi_taxid` is not a taxid but sequential surrogates from `900000001`
  - `run_bacdive_fill.py` queries BacDive with `taxonomy=<genus species>` (first two words of the name)
  - 10,220 rows of categorical phenotype assigned by species-name string matching with no taxonomic authority
- **Genome download manifest issue**: `target_accession`, `assembly_level`, `genome_fna` populated for 1 of 11,143 rows
  - GCA→GCF resolution happened but was never written down
  - Recovered from Drive filenames: 10,910 GCF + 220 GCA, corroborating `PROGRESS.md`'s 10,891/220
- **Absolute paths issue**: 11,064 rows with absolute paths into `/Users/emm0012/…` (resolves on one machine)
- **Join issues**: Two joins return nothing even normalized (16S isolates→NFixDB is 0 of 197)

### My Own Check Errors
- **Duplicate-row check**: Counted blank spacer rows, flagging six Bergey's documentation sheets as critical
- **Join checker**: Didn't know `accession_core` was a bare core, reported 0% everywhere
  - After fix, count of 1,149 distinct annotated genomes matches the team's own `master_x_nfixdb.csv` exactly

## Madin Provenance

### Source Contribution Table
- **Madin is mostly Corkrey**: 71% from one compilation (661 organisms)
- **Other sources**:
  - silva (130 organisms, Vieira-Silva & Rocha - minimal doubling times)
  - methanogen (54 organisms, Methanogen physiology DB)
  - kremer (23 organisms, Phytoplankton growth)
  - masonmm (22 organisms, Mason, *J. Bacteriol.* 1935)
  - mediadb (22 organisms, The only one recording the medium)
  - edwards (7 organisms, Phytoplankton traits)
  - prochlorococcus (7 organisms, *Prochlorococcus* ecotypes)
  - nielsensl (2 organisms, Algal size-scaling)

### Key Observations
- **774 of 928 organisms rest on a single measurement**
- **Sources don't measure the same quantity**: Vieira-Silva reports minimal doubling time, Corkrey reports points on a temperature curve, MediaDB reports rates in defined media
- **Phytoplankton sources**: All 32 are cyanobacteria, two (*Trichodesmium*, *Crocosphaera*) are major diazotrophs
- **Anabaena variabilis**: Best-supported entry at n=4, every other alt-nitrogenase organism rests on one or two

## Proxy Validation from Public Data

### N-Free Media Test
- **BacDive media**: 22,656 parsed compositions across 2,426 media
- **Zero media have a verifiably nitrogen-free ingredient list**
  - 76 resolve to opaque commercial products (Marine agar, LB, Columbia)
  - Nine survive on medium name alone (Ashby, Nfb, LGI)
  - All nine are genuine diazotrophs, eight have genomes

### Reframed Proxy Model
- **Fixation rate = µ × Q_N** (Q_N = cell nitrogen quota, mol N gDW⁻¹)
- **Model as ARA / (µ × Q_N)** - dimensionless fixation-efficiency ratio
- **Predict µ_max from genome features**: Codon usage bias, rRNA operon copy number (Vieira-Silva & Rocha 2010)
  - Features available: codon usage (12,039 protein FASTAs), rrn copy number (rrnDB), genome size, GC, oxygen tolerance, optimum temperature, nif/vnf/anf complement

### Public Data for Validation
1. **MediaDB** (Richards 2014) - only Madin source pairing rates with defined media
2. **Luo et al. 2012, *Earth Syst. Sci. Data*** - global ocean diazotroph database
3. **Deep single-organism literature** for canonical models (*Azotobacter vinelandii*, *Klebsiella oxytoca*, *Rhodobacter*, *Anabaena*, *Trichodesmium*)
4. **µGrowthDB** condition metadata

## Current Work
- **Committed changes**: `7e2311e` (gold set), `cbdf0a5` (health assessment), `ebfdc5a` (N-free media test)
- **Scripts**: `qc_team_repo.py`, `qc_joins.py`, `trace_madin_provenance.py`, `find_nfree_media.py`, `build_health_report.py`
- **Files**: `gold_set_curated.csv`, `nfree_media_strains.csv`, `team-repo-data-health.html`

## Next Steps
- **Run Phase A** of the literature mining workflow to validate the gold set and report precision/recall
- **Decide on Phase C** based on the results of Phase A and the scientific value of the few dozen verified rates