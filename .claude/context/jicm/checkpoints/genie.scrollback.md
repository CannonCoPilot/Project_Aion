# Pre-/clear Scrollback Capture
# Captured: 2026-08-19T21:19:16Z | key: genie | session: 1af5ddf2-e38c-40b2-a8f4-b91e081cfb58

       12         tables rendered      RENDER      value-to-column-header link preserved
       13   7,953 rates proposed       EXTRACT     local LLM, tables first
       14     273 accepted             ADJUDICATE  7,511 rejected · 141 flagged · 27 dup
       15     248 canonical            CANONICALISE 91% parse to comparable units
       16    ~205 defensible           AUDIT       hand audit puts precision at 0.76
       17 ```
       18
       19 ---
       20
       21 ## 1. DISCOVER — make the corpus dense before spending anything on it
       22
       23 Query: `nitrogenase AND OPEN_ACCESS:Y AND HAS_FT:Y` against Europe PMC.
       24
       25 The `OPEN_ACCESS:Y AND HAS_FT:Y` clause is doing more work than the topic term.
       26 It makes every hit **retrievable by construction**, which replaced an earlier
       27 approach — mining a general literature list — that lost twice over: a read-audit
       28 of 40 of those papers found **1 about nitrogen fixation**, and only **17%** of the
       29 list could be retrieved at all.
       30
       31 **The measured lesson, and the single most useful thing in this document:**
       32
       33 | query | accepted rates per paper |
       34 |---|---|
       35 | `nitrogenase` (broad topic) | **0.009** |
       36 | `("acetylene reduction" OR "nitrogenase activity") AND nmol` | **0.245**, replicated at 0.236 |
       37 | `"acetylene reduction assay" AND ("mg protein" OR "cell dry weight")` | **1.15** |
       38
       39 **~128× between top and bottom.** The discriminating feature is not the topic
       40 and not even the unit — it is the **biomass denominator**, because that is
       41 exactly what separates a rate that can label a strain from one that cannot.
       42 `nmol C2H4 mg protein⁻¹ h⁻¹` and `nmol N L⁻¹ d⁻¹` are the same pattern up to the
       43 denominator, and only the first is usable here.
       44
       45 Practical consequence: **rank compute by denominator co-mention.** Screening the
       46 dense slice first returned 83 rates in 69 minutes; the broad remainder returned
       47 23 in 3 h 37 m, on the same hardware with the same code.
       48
       49 ## 2. RETRIEVE — 6,367 of 6,368, at 4.8 papers/second
       50
       51 JATS XML from Europe PMC, fetched by PMCID so there is no DOI→PMCID resolution
       52 step to fail. 13 failures out of 5,910 fetched in the main run.
       53
       54 **XML, not PDF, and this matters.** PDF flattens a table into a stream of tokens
       55 and destroys the association between a value and its column header — the very
       56 thing the next stage depends on.
       57
       58 ## 3. GATE — a paper must be *about* nitrogen fixation
       59
       60 Count of N-fixation terms across the full body with references stripped;
       61 threshold ≥2. Measured, not guessed: papers producing a high-confidence rate had
       62 a minimum of 2; papers producing only rejected rates had a median of 0.
       63
       64 A title/abstract gate was **tried and rejected** — it dropped 22% of
       65 high-confidence papers, because real diazotroph work often never says "nitrogen
       66 fixation" in the abstract.
       67
       68 On the earlier general corpus this gate removed **92.8%** of papers and cost no
       69 recall: all 32 rates that had been accepted by hand survived it.
       70
       71 ## 4. RENDER — tables stay tables
       72
       73 Each `<table-wrap>` is rendered as a markdown table with the header row intact.
       74
       75 **This is the design decision worth the most.** In a paper the value sits in a
       76 cell and its unit sits in the column header, and no sentence-level pattern
       77 bridges that at any tuning: 6 of 7 rates a regex screen wrongly cleared were in
       78 papers with tables. **68% of accepted rates come from tables** — without this
       79 step most of them are unreachable.
       80
       81 ## 5. EXTRACT — a local model, with a budget
       82
       83 `qwen3-8b` via a local OpenAI-compatible endpoint. Tables first, then only prose
       84 paragraphs carrying a rate cue; 24k characters per paper; 2,500 output tokens.
       85
       86 Two settings that are requirements rather than tuning:
       87
       88 - **The output cap is mandatory and a truncated response is an error, never a
       89   partial result.** Uncapped, a rate-rich paper — exactly the ones that matter —
       90   exceeds the gateway timeout and returns empty, which then scores as a correct
       91   negative. Half a table is not a result.
       92 - **Concurrency is 4.** Measured: 4 workers 3.84 papers/min, 6 → 2.98, 8 → 1.37.
       93   More workers thrash the GPU.
       94
       95 The model is asked for `organism, value, unit, subject_type, conditions, quote,
       96 source` and is instructed that returning an empty list is the correct and common
       97 answer.
       98
       99 ## 6. ADJUDICATE — about twenty rules, applied in a deliberate order
      100
      101 This stage exists because **an extraction count is a hypothesis, not a result.**
      102 On the earlier corpus every headline fell on contact with adjudication:
      103 861 → 679 → 118 → 32.
      104
      105 Rules run in this order, and the order is load-bearing:
      106
      107 1. **Fabrication first** — a zero value; a paper containing no assay at all; a
      108    value that does not appear in *its own quote*. Fabrication is tested before
      109    anything that could excuse it, because a fabricated value with an impeccable
      110    unit string would otherwise be accepted on the strength of the unit. That is
      111    exactly how 37 invented zeros passed two earlier guards.
      112 2. **Scientific notation and percentages** — `(2.8 ± 0.2) × 10⁻⁶` reported as
      113    `2.8`; "reduced by 81.4%" wearing a rate's unit.
      114 3. **Attribution** — non-isolate `subject_type` (whitelist, not blacklist),
      115    plasmid-bearing recombinants, non-diazotrophic hosts, per-plant units.
      116 4. **What the number is** — relative/fold change, purified-enzyme preparations,
      117    transcript counts, values cited to another publication, summary rows.
      118 5. **Usability** — volumetric and missing-denominator rates are **flagged, not
      119    rejected**: real measurements that cannot label a strain.
      120 6. **Duplicates** — same strain, same measurement at written precision.
      121 7. **Magnitude plausibility** — is the number the right *size* for its own unit?
      122    Flags, never rejects.
      123
      124 **Rejected rows are retained with their reason.** Any rule can be reversed by
      125 filtering the data differently.
      126
      127 ### Two rules worth explaining
      128
      129 **Check the value against its own quote, not the document.** A document-wide
      130 check is nearly meaningless — the digit `0` appears in every paper, which is how
      131 37 fabricated zeros survived. Comparison is numeric, at the coarser of the two
      132 written precisions, so `15.30` matches `15.3` but `13.19` does not match `4.02`.
      133
      134 **Magnitude flags, never rejects.** A value outside its class can be an
      135 extraction error *or* an error in the published paper — one source states
      136 `~14 mmol C2H4 mg protein⁻¹ 24 h⁻¹`, implausible by 3–4 orders and read
      137 *correctly*. No magnitude check can tell those apart, so it marks the rate for
      138 review rather than discarding someone's measurement.
      139
      140 ## 7. CANONICALISE — comparable, within limits
      141
      142 Units are parsed into `(amount × analyte) / (biomass × time)`. 91% parse.
      143
      144 Amount and time convert freely. **Denominators do not.** `mg protein`, `per
      145 cell`, `mg dry weight` and `mg chlorophyll` are different physical quantities;
      146 converting between them needs a per-organism biomass factor this project does
      147 not have. Rates are canonicalised **within** a class and left incomparable
      148 across classes — the honest representation, and the reason there is no single
      149 "usable rates" number.
      150
      151 The corpus writes this unit at least a dozen ways — `nmoL`, `ηmole`, `n moles of
      152 ethylene`, `nmol C2H4/mgprotein/h`, `(nmol C2H4) (mg protein) ⁻¹ h⁻¹`. Every
      153 spelling missed by a query is a paper silently not returned: the
      154 spelling-complete family returns **142 papers where one spelling returns 38**.
      155
      156 ## 8. AUDIT — a person reads the output
      157
      158 All 170 accepted rates from one 470-paper slice were read against their quotes,
      159 and the 21 the quotes could not settle were resolved against the source XML.
      160
      161 **115 clean, 49 errors, 6 unresolved — precision 0.76** after folding the
      162 fixable classes back into the rules.
      163
      164 The audit moved rows **in both directions**: six would have been wrongly
      165 discarded on quote evidence alone, including two *Rhodopseudomonas* values that
      166 resolved only by reading the table header (`DT | DT | Nitrogenase | Hydrogenase`).
      167
      168 ---
      169
      170 ## What still fails
      171
      172 | class | n in audited slice | fixable by rule? |
      173 |---|---|---|
      174 | engineered/mutant strain typed `isolate` | 18 | partly — the tell is in the row label |
      175 | **wrong column / wrong row** | **11** | **no** |
      176 | not a rate (content, fold-change, threshold, mean) | 10 | yes — done |
      177 | value cited from another paper | 5 | yes — done |
      178 | purified enzyme / plant tissue | 4 | yes — done |
      179 | fabricated | 1 | partly |
      180
      181 **The wrong-column error is the standing hole.** Number real, quote real, unit
      182 real, organism right — the value simply comes from the neighbouring column. The
      183 type case: a table with adjacent `ARA` and `ACC deaminase` columns, where 195.60
      184 and 570.47 were reported as ARA rates when the real ARA values, 24.23 and 29.59,
      185 sit one column left. Closing it needs a second model reading the rendered table,
      186 or a person.
      187
      188 ## A recurring methodological result
      189
      190 **A metric measured on a curated sample has failed to transfer to an uncurated
      191 one five times in this project** — a route's uniqueness, a recovery hypothesis, a
      192 30-paper gold set that could not see a 42% contamination, an adjudicator scoring
      193 0.94 on one corpus and 0.68 on the next, and a yield estimate that fell 26× when
      194 the query widened. Validate on the population you will run on. It is the reason
      195 every number in this folder is reported with the population it was measured on.
  ⎿  Async hook PostToolUse completed

⏺ Now the data quality report, benchmarked against the existing dataset:

⏺ Write(/Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI/Cannon_data_provenance/docs/03_data_quality_report.md)
  ⎿  Wrote 156 lines to /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI/Cannon_data_provenance/docs/03_data_quality_report.md
        1 # Data quality report
        2
        3 Benchmarked against the existing literature-mined dataset in
        4 `Jen_data from literature/`, which is the right baseline: it is the only prior
        5 attempt in this project to get fixation rates out of the literature at scale,
        6 and it defines what "good enough" has meant so far.
        7
        8 **A note on what is being compared.** These two efforts had different tools
        9 available. The existing dataset was assembled from titles, abstracts and
       10 sentence snippets, because full-text retrieval at scale did not exist in this
       11 project when it was built. It also covers a far broader phenotype scope — 26,692
       12 measurements spanning GC content, pH range, salinity and growth optima, of which
       13 fixation rates are a small part. The comparison below is narrow on purpose: it
       14 asks only about **nitrogenase rate rows**, and the difference it finds is mostly
       15 a difference in *what evidence was reachable*, not in care taken.
       16
       17 ---
       18
       19 ## 1. The baseline, characterised
       20
       21 `literature_quant_measurements.csv` — 26,692 rows over 11,722 DOIs.
       22
       23 | measurement_type | rows |
       24 |---|---|
       25 | GC_mol_pct | 7,308 |
       26 | pH_range | 4,765 |
       27 | NaCl_pct | 4,156 |
       28 | temp_optimum_C | 3,166 |
       29 | pH_optimum | 2,986 |
       30 | enzyme_activity | 1,643 |
       31
       32 **Only 2,230 of 26,692 rows (8.4%) are open access**, so 91.6% cannot be checked
       33 against their source at any effort. 17,561 of 26,692 (66%) carry an organism.
       34
       35 `literature_rates_curated.csv` — 81 curated rows: 46 `doubling_time`, **20
       36 `nitrogenase_ARA`**, 15 `growth_rate`. The 20 ARA rows are the fixation-rate
       37 baseline.
       38
       39 ## 2. Provenance audit of the 20 baseline ARA rows
       40
       41 Each row was checked against the source it cites.
       42 Data: `ara_provenance_audit.csv`.
       43
       44 | verdict | n | what it means |
       45 |---|---|---|
       46 | `mismatch` | 7 | the value belongs to a different organism, or a different enzyme entirely |
       47 | `scale_mismatch` | 5 | wrong scale — per plant, per nodule, or bulk seawater `nmol N L⁻¹ d⁻¹` |
       48 | `duplicate` | 5 | **one value (81) propagated across five *Azospirillum* congeners** |
       49 | `misattributed` | 2 | a co-culture rate and an rpoB lab mutant attributed to wild-type species |
       50 | `confirmed_conditional` | 1 | *M. fumariolicum* SolV — survives, with caveats |
       51
       52 **19 of 20 fail; 1 survives conditionally.** Concrete cases:
       53
       54 - A **GH51 α-L-arabinofuranosidase** characterisation supplying `426.5
       55   µmol/min/mg` as a nitrogenase rate — and the same value duplicated onto a
       56   second organism.
       57 - A paper describing *Azotosporobacter soli* supplying a value filed under
       58   *Anaerospora hongkongensis*.
       59 - The surviving row's unit is **truncated**: stored as `nmol ethylene h⁻¹`,
       60   where the source says `nmol ethylene h⁻¹ (mg cell dry weight)⁻¹`. The
       61   denominator — the thing that makes it usable — was lost in storage.
       62
       63 **The mechanism, and it is not carelessness.** These failures are what
       64 title-and-snippet mining produces when full text is unavailable. A snippet
       65 carries a number and a unit but not the sentence that says whose rate it is, and
       66 the co-occurrence of an organism name in an abstract is a weak link that breaks
       67 silently. **The fix was not more care; it was full text.**
       68
       69 ## 3. Side-by-side
       70
       71 | | baseline (`nitrogenase_ARA`) | this pipeline |
       72 |---|---|---|
       73 | rows | 20 | **273** |
       74 | survive provenance check | **1** | **~205** (precision 0.76 × 273) |
       75 | verbatim quote containing the value | evidence snippet on 20/20, but value-in-quote not enforced | **273/273, enforced numerically** |
       76 | DOI present | 20/20 | 273/273 |
       77 | unit carries a biomass denominator | **12/20 (60%)** | **272/273 (99.6%)** |
       78 | unit parses to a canonical form | not attempted | 248/273 (91%) |
       79 | distinct unit spellings | 14 across 20 rows | 70 across 299, all parsed or flagged |
       80 | conditions recorded | section recorded, conditions not | 273/273 |
       81 | `subject_type` (isolate/mutant/co-culture/bulk) | **absent** | 273/273 |
       82 | rejected rows retained with a reason | no | **7,511 rows, each with a reason** |
       83 | source open access | 8.4% of the parent set | **100%** |
       84
       85 ### The two differences that matter most
       86
       87 **`subject_type` did not exist in the baseline schema, and 2 of its 20 failures
       88 are exactly what that field prevents** — a co-culture rate and a lab mutant's
       89 rate stored against wild-type species. A rate is not a property of an organism
       90 name; it is a property of an organism *in a condition*, and the schema has to
       91 say which.
       92
       93 **The denominator.** 8 of 20 baseline rows lack a biomass denominator, which
       94 makes them dimensionally incomplete — not wrong, but unusable as strain labels.
       95 This pipeline treats a missing denominator as a `flag` verdict, so those rates
       96 are visible and separated rather than silently mixed in with usable ones.
       97
       98 ## 4. Quality of this pipeline's output — measured, not asserted
       99
      100 **Hand audit of 170 accepted rates** (`stage6_hand_audit_170.csv`): every row
      101 read against its quote, and the 21 ambiguous ones resolved against source XML.
      102
      103 **115 clean · 49 errors · 6 unresolved → precision 0.76.**
      104
      105 | error class | n | status |
      106 |---|---|---|
      107 | engineered/mutant strain typed `isolate` | 18 | partly fixable; the tell is in the strain designation |
      108 | **wrong column / wrong row** | **11** | **not fixable by rule** |
      109 | not a rate (content, fold-change, threshold, `Mean` row) | 10 | rules added |
      110 | value cited from a different paper | 5 | rule added |
      111 | purified enzyme / plant tissue | 4 | rules added |
      112 | fabricated | 1 | the number `610`, invented in three separate papers |
      113
      114 **The pipeline reproduced one of the baseline's own failure modes**, which is
      115 worth naming: five accepted rates turned out to be values a paper had **cited
      116 from four other papers** in a literature-comparison table — the same provenance
      117 error the baseline audit found in its `mismatch` class. A rule now rejects rows
      118 citing a reference number. **A mining pipeline can manufacture the defect it was
      119 built to detect.**
      120
      121 ### Reproducibility
      122
      123 Re-extracting the same corpus moves the accepted count by about **±9%** at
      124 temperature 0. Counts should be quoted with that spread, not as exact integers.
      125 This is a property of the model, and §2 of the tool proposal addresses it
      126 directly.
      127
      128 ## 5. Coverage, and the honest ceiling
      129
      130 - **6,367 papers screened; 85 yielded an accepted rate (1.3%).** Most nitrogenase
      131   papers genuinely contain no whole-cell isolate rate — they are structural
      132   biology, genetics, field ecology or plant symbiosis.
      133 - **~70% of this literature has no open-access copy anywhere.** Those
      134   measurements are unverifiable at any effort. They are recorded as
      135   source-unverified rather than chased.
      136 - **The open-access seam is close to exhausted.** We now hold 6,367 of the 6,368
      137   Europe PMC open-access nitrogenase papers; a maximally precise query returns
      138   142 hits of which only **7** are new. Further volume must come from outside
      139   open access, not from better querying.
      140
      141 ## 6. What the data supports, and what it does not
      142
      143 **Supports:** a set of **144 protein-normalised rates** with sources,
      144 quotes, units, conditions and subject types, spanning a clean four-order
      145 biological range (median 112, range 0.75–9,000 nmol mg protein⁻¹ h⁻¹), each
      146 checkable in one step.
      147
      148 **Does not support:** treating all 273 as one comparable set — they span
      149 denominator classes that do not convert. Nor treating any single rate as
      150 gold without reading it; at 0.76 precision, roughly one row in four in the
      151 accepted set is wrong, and the hand-audited slice is the only part where that
      152 has been resolved row by row.
      153
      154 **Recommended use:** take `stage5b_protein_normalised.csv` as the working label
      155 set, spot-check a sample against sources, and treat `stage4b_flagged...csv` as a
      156 reserve that becomes usable if per-organism biomass factors are ever available.
  ⎿  Async hook PostToolUse completed

∴ Now I'm moving to the third document, the agentic tool proposal. The user wants a fully engineered agentic workflow that's reusable, reproducible, and gives control over model endpoints
  and API calls, so I need to cover architecture, reproducibility, endpoint/cost control, and reusability, starting from the current state of research scripts rather than a packaged tool.

  I'm sketching the target architecture: a config-driven pipeline with provider abstraction, run manifests, caching, determinism controls, a validation harness, and cost controls, then
  defining concrete stages and interfaces. For reproducibility I'm planning pinned models, prompt hashing, seeds, content-addressed caching, run manifests, and a golden regression set; for
  endpoint control, provider adapters for local and hosted models with routing policy, budget caps, rate limits, and retries; and for deployment, a CLI with config files, resumability, and
  observability. I want to ground all of this in what was actually learned — the ±9% nondeterminism, the worker=4 finding, the timeout/truncation issue, adjudication as a pipeline stage,
  and the audit harness — then lay out a phased implementation plan with effort estimates and open risks.

⏺ The tool proposal — this needs to be a real engineering document:

⏺ Write(/Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI/Cannon_data_provenance/docs/02_agentic_tool_proposal.md)
  ⎿  Wrote 261 lines to /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI/Cannon_data_provenance/docs/02_agentic_tool_proposal.md
        1 # Proposal — from research scripts to a reusable extraction tool
        2
        3 ## The problem with what exists
        4
        5 The pipeline in this folder produced defensible results, but it is **a set of
        6 research scripts, not a tool**. Concretely, it fails four tests a shared
        7 instrument has to pass:
        8
        9 1. **Reproducibility.** Re-running the same corpus moves the accepted count by
       10    ~±9%. There is no run manifest, so a number in a report cannot be traced to
       11    the exact code, prompt, model and configuration that produced it.
       12 2. **Endpoint control.** The model endpoint is a constant near the top of a
       13    script. Switching to a hosted API, or to a different local model, means
       14    editing code.
       15 3. **Cost control.** There is no budget ceiling, no token accounting, and no way
       16    to say "spend at most $X on this corpus".
       17 4. **Reusability.** Every rule is specific to nitrogenase rates. Extracting a
       18    different phenotype — doubling time, salinity optimum — means a new script,
       19    and would repeat every mistake this one already made.
       20
       21 What follows is a proposal to fix those four things **without rewriting the
       22 parts that work**. The extraction and adjudication logic is validated and should
       23 be preserved almost as-is; what it needs is an engineered shell.
       24
       25 ---
       26
       27 ## 1. Architecture
       28
       29 ```
       30                  ┌────────────────────────────────────────────┐
       31    config.yaml ─▶│  RUN CONTROLLER                            │
       32    (the only     │  resolves config, stamps a run manifest,   │
       33     thing a user │  enforces budget, drives stages, resumes   │
       34     edits)       └────────────────────────────────────────────┘
       35                         │            │             │
       36               ┌─────────▼──┐  ┌──────▼──────┐  ┌───▼─────────┐
       37               │ DISCOVERY  │  │ EXTRACTION  │  │ ADJUDICATION│
       38               │ providers  │  │ providers   │  │ rule packs  │
       39               ├────────────┤  ├─────────────┤  ├─────────────┤
       40               │ EuropePMC  │  │ local/Ollama│  │ nitrogenase │
       41               │ PubMed     │  │ LiteLLM     │  │ growth_rate │
       42               │ Unpaywall  │  │ Anthropic   │  │ (extensible)│
       43               │ Crossref   │  │ OpenAI      │  │             │
       44               └────────────┘  └─────────────┘  └─────────────┘
       45                         │            │             │
       46                  ┌──────▼────────────▼─────────────▼──────┐
       47                  │  CONTENT-ADDRESSED CACHE + RUN LEDGER  │
       48                  │  every API call keyed by input hash    │
       49                  └────────────────────────────────────────┘
       50 ```
       51
       52 Four ideas carry the design:
       53
       54 - **Config is the only user surface.** No code edits to change model, corpus,
       55   thresholds or budget.
       56 - **Providers are interfaces, not constants.** Discovery and extraction each
       57   have a small adapter contract, so a new database or a new model is a plugin.
       58 - **Every API call is cached by content hash.** Re-runs cost nothing, and a
       59   cached run is bit-identical.
       60 - **Adjudication is a versioned rule pack, separate from extraction.** Rules
       61   change more often than extraction does, and re-adjudicating should never
       62   require re-inference — this already happens (`--adjudicate-only`) and should be
       63   formalised.
       64
       65 ---
       66
       67 ## 2. Reproducibility
       68
       69 **The honest position: LLM extraction cannot be made bit-reproducible on
       70 re-inference.** Temperature 0 still moves ±9% here. So the design does not
       71 promise determinism; it promises **traceability plus replay**.
       72
       73 ### 2.1 Run manifest — emitted for every run, non-optional
       74
       75 ```yaml
       76 run_id: 2026-08-19T14:02Z-a91f3c
       77 code:      {git_sha: 4b8bfcc, dirty: false}
       78 prompt:    {sha256: 9f2c…, version: nitrogenase-v3}
       79 model:     {provider: ollama, name: qwen3-8b, digest: sha256:1a2b…,
       80             temperature: 0, max_tokens: 2500, seed: 12345}
       81 corpus:    {query: "nitrogenase AND OPEN_ACCESS:Y AND HAS_FT:Y",
       82             resolved_at: 2026-08-17T22:41Z, hit_count: 6368,
       83             pmcid_list_sha256: c41d…}
       84 rules:     {pack: nitrogenase, version: 7, sha256: 77ab…}
       85 outputs:   {accepted: 273, flagged: 141, rejected: 7511,
       86             cache_hits: 0, cache_misses: 6367}
       87 cost:      {input_tokens: 41.2M, output_tokens: 1.9M, usd: 0.00}
       88 ```
       89
       90 Any number in any report cites a `run_id`. **This is the single highest-value
       91 item in the proposal** — it converts "273 rates" from an assertion into a claim
       92 with an address. The corpus is pinned by a **hash of the resolved PMCID list**,
       93 not by the query, because the query is not stable: the same query returned 6,567
       94 hits when first recorded and 6,368 two weeks later.
       95
       96 ### 2.2 Content-addressed cache
       97
       98 Key: `sha256(model_id + prompt_version + normalised_input_text)`.
       99 Value: the raw model response plus token counts.
      100
      101 - A re-run with unchanged inputs is a **cache replay: free, and identical**.
      102 - Changing the rule pack re-adjudicates from cache without new inference.
      103 - Changing the prompt or model invalidates only the affected keys.
      104
      105 This turns "reproduce the 2026-08-19 result" into a supported operation.
      106
      107 ### 2.3 Golden regression set
      108
      109 The 170 hand-audited rates and the 118 hand-adjudicated rows already function as
      110 a test set. Formalise them: `pytest` runs the rule pack against them and fails on
      111 a precision or recall regression. This has already caught real problems — a
      112 cited-reference rule that discarded a legitimate wild-type rate was caught this
      113 way, in one run.
      114
      115 ### 2.4 Sampling controls
      116
      117 Expose `temperature`, `seed`, and `n_samples`. Setting `n_samples: 3` with
      118 majority-agreement on the extracted value would convert the ±9% run-to-run
      119 spread into a measurable confidence signal per rate. **Worth piloting before
      120 adopting** — it triples inference cost for an unmeasured precision gain.
      121
      122 ---
      123
      124 ## 3. Model endpoint and API control
      125
      126 ### 3.1 Provider adapters
      127
      128 One contract:
      129
      130 ```python
      131 class ExtractionProvider(Protocol):
      132     name: str
      133     def complete(self, system: str, user: str, *,
      134                  max_tokens: int, temperature: float,
      135                  seed: int | None) -> Completion: ...
      136     def estimate_cost(self, in_tok: int, out_tok: int) -> float: ...
      137 ```
      138
      139 Shipping with: `ollama` (direct), `litellm` (any OpenAI-compatible gateway),
      140 `anthropic`, `openai`. Selection is config:
      141
      142 ```yaml
      143 extraction:
      144   provider: ollama
      145   model: qwen3-8b
      146   endpoint: http://localhost:11434
      147   max_tokens: 2500
      148   temperature: 0
      149   concurrency: 4          # measured optimum; 8 thrashes the GPU
      150   timeout_s: 600
      151   on_truncation: error    # NEVER accept a partial response as a result
      152 ```
      153
      154 ### 3.2 Routing policy — cheap model for bulk, strong model for hard cases
      155
      156 The measured picture argues for a two-tier design. Local 8B handles bulk
      157 extraction at zero marginal cost. A frontier model is worth paying for on
      158 exactly the cases where rules fail — above all the **wrong-column** class, which
      159 is 11 of 49 known errors and unreachable by any string rule.
      160
      161 ```yaml
      162 routing:
      163   bulk:      {provider: ollama,    model: qwen3-8b}
      164   escalate:  {provider: anthropic, model: claude-sonnet-4-5}
      165   escalate_when:
      166     - rate_came_from_table_with_multiple_numeric_columns
      167     - magnitude_flagged
      168     - adjudication_verdict_in: [flag]
      169   escalate_max_fraction: 0.10   # hard ceiling on escalated share
      170 ```
      171
      172 Escalation is the concrete proposal for the standing hole: a second model shown
      173 the **rendered table** and asked only *"which column does this value come
      174 from?"* — a narrow question with a checkable answer, on ~10% of rates.
      175
      176 ### 3.3 Budget and rate limits — enforced, not advisory
      177
      178 ```yaml
      179 budget:
      180   max_usd: 25.00
      181   max_output_tokens: 5_000_000
      182   on_exceed: stop_and_checkpoint
      183 limits:
      184   requests_per_second: {anthropic: 4, ncbi: 3}   # NCBI bans, not throttles
      185   retry: {attempts: 3, backoff: exponential, jitter: true}
      186 ```
      187
      188 The controller refuses to start a run whose *estimated* cost exceeds the budget,
      189 and checkpoints rather than dying when a live run approaches it. Per-run cost
      190 lands in the manifest, so cost per accepted rate becomes a tracked metric.
      191
      192 ### 3.4 Secrets
      193
      194 API keys from environment or a keyring, never from a config file in the repo,
      195 and never logged. The current codebase already keeps keys out of tracked files;
      196 this makes that structural rather than careful.
      197
      198 ---
      199
      200 ## 4. Reusability beyond nitrogenase
      201
      202 The valuable, transferable part is not the nitrogenase regexes — it is the
      203 **shape**: retrieve full text → preserve tables → extract with a schema →
      204 adjudicate against explicit rules → canonicalise units → audit a sample.
      205
      206 A **rule pack** would declare what a phenotype needs:
      207
      208 ```yaml
      209 pack: nitrogenase_rate
      210 schema: {organism, value, unit, subject_type, conditions, quote, source}
      211 topic_terms: [nitrogenase, diazotroph, "acetylene reduction", nifH]
      212 required_unit: {analyte: [C2H4, N2], denominator: [protein, cells, dry_weight]}
      213 plausible_magnitude: {protein: [0.05, 2e4], cells: [1e-12, 1e-3]}
      214 reject_when: [subject_type != isolate, unit_has_percent, value_not_in_quote]
      215 ```
      216
      217 `doubling_time` and `growth_rate` — the other 61 rows of the curated table —
      218 would be new packs against the same engine, and would inherit every fabrication
      219 guard this one learned the hard way.
      220
      221 ---
      222
      223 ## 5. Delivery plan
      224
      225 | phase | scope | outcome | est. |
      226 |---|---|---|---|
      227 | **1** | Run manifest + content-addressed cache | every number traceable; free re-runs | 2–3 d |
      228 | **2** | Provider adapters + budget/rate limits | swap models by config; enforced ceilings | 3–4 d |
      229 | **3** | Rule packs as YAML + golden regression tests in CI | rules change safely; second phenotype possible | 4–5 d |
      230 | **4** | Escalation tier for wrong-column adjudication | attacks the one unfixable error class | 3–4 d |
      231 | **5** | CLI + docs + a worked second phenotype | genuinely reusable by someone else | 3–5 d |
      232
      233 **≈3–4 weeks.** Phases 1 and 2 are independently valuable and should not wait on
      234 the rest. Phase 4 is the only one whose payoff is uncertain and should be gated
      235 on a measured pilot: escalate 50 known wrong-column cases and see whether a
      236 frontier model actually resolves them.
      237
      238 ---
      239
      240 ## 6. What this will not fix
      241
      242 - **The open-access ceiling.** ~70% of this literature is unreachable, and no
      243   amount of engineering changes that. Only licensed access or publisher
      244   agreements would.
      245 - **Precision to 1.0.** Some rates need a domain expert reading a figure. The
      246   goal is to make the residue small, visible, and cheap to audit — not zero.
      247 - **Determinism on re-inference.** Addressed by caching and traceability, not
      248   eliminated.
      249
      250 ## 7. Decisions needed before building
      251
      252 1. **Is a hosted API acceptable for the escalation tier**, and is there a budget?
      253    Everything so far is local and free; the escalation tier is the first thing
      254    that would cost money.
      255 2. **Which phenotype is the second rule pack?** Building for two is what forces
      256    the abstraction to be real. `doubling_time` is the obvious candidate and
      257    would extend the existing curated table.
      258 3. **Where does the tool live** — this repo, or its own? It has no dependency on
      259    IMAGINE data and would be reusable by other projects if separate.
      260 4. **Who else needs to run it**, and on what hardware? That decides whether the
      50
      51 | column | meaning |
      52 |---|---|
      53 | `canonical_unit` | e.g. `nmol C2H4 (protein)-1 h-1`. Empty when the unit could not be fully parsed |
      54 | `value_nmol_per_denominator_per_h` | converted value. **Comparable only within one `denominator_class`** |
      55 | `denominator_class` | `protein`, `cells`, `dry_weight`, `chlorophyll`, `cell_mass`, `mass_unspecified`, `cfu`, `biomass` |
      56 | `analyte` | `C2H4` or `N2` |
      57
      58 ## Two cautions
      59
      60 **Do not pool across `denominator_class`.** `mg protein`, `per cell`, `mg dry
      61 weight` and `mg chlorophyll` are different physical quantities. Converting
      62 between them needs a per-organism biomass factor we do not have, so the values
      63 are canonicalised *within* a class and left incomparable across classes. Pooling
      64 them would produce a distribution spanning ten orders of magnitude that means
      65 nothing.
      66
      67 **`mass_unspecified` means the paper wrote a bare `mg⁻¹`** with no noun after it.
      68 It is almost certainly mg protein by convention — but the paper did not say so,
      69 so it is not filed as protein. Treat it as a separate, lower-confidence class.
      70
      71 ## Suggested starting point
      72
      73 ```r
      74 rates <- read.csv("stage5b_protein_normalised.csv")
      75 # 136 rates, one denominator class, median 112, range 0.75-9,000
      76 # nmol C2H4 mg protein-1 h-1
      77 ```
      78
      79 Then spot-check rows against `quote` and `doi`. **Disagreements are the most
      80 useful feedback available** — at 0.76 precision roughly one accepted row in four
      81 is wrong, and only the 170 rows in `stage6` have been resolved individually.
  ⎿  Async hook PostToolUse completed

∴ I realize I overwrote the existing README.md without checking its prior contents first — it previously described the provenance audit from an earlier commit, and I should have looked at
  it before overwriting. I need to check the git diff to see if I destroyed anything important and integrate it back if so.

⏺ I overwrote the existing README without reading it first — checking what was there:

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI; git diff --stat Cannon_data_provenance/README.md; echo "=== ORIGINAL (HEAD) ==="; git show
      HEAD:Cannon_data_provenance/README.md)
  ⎿   Cannon_data_provenance/README.md | 161 ++++++++++++++++++++-------------------
      1 file changed, 81 insertions(+), 80 deletions(-)
     === ORIGINAL (HEAD) ===
     # Cannon_data_provenance — provenance audit of the mined N-fixation rates

     Nathaniel Cannon · first commit 2026-08-12

     This folder holds **verification work on data that already exists in this repo**.
     It adds no new measurements. Its purpose is to establish which of the mined
     nitrogen-fixation rates can carry weight in a model, and which cannot.

     Nothing outside this folder is modified.

     ---

     ## Why this exists

     `Jen_data from literature/literature_rates_curated.csv` contains 20 rows typed
     `nitrogenase_ARA` — the only curated, organism-attributed, genome-linked
     acetylene-reduction rates anywhere in the project. They are also the only
     candidate labels for a quantitative N-fixation model. So they are worth checking
     individually before anything is built on them.

     Each row carries a DOI. Resolving those DOIs through Crossref and putting the
     source paper's **title** beside the organism the value was assigned to is enough
     to see whether the two agree.

     ## What the audit found

     Of the 20 rows, **none survives as a confirmed, organism-specific, free-living
     nitrogenase rate.**

     | Verdict | n | Meaning |
     |---|--:|---|
     | `mismatch` | 7 | The source paper measures a different enzyme, or is about a different organism than the one the value was assigned to |
     | `duplicate` | 5 | One measurement propagated to five *Azospirillum* congeners by genus-level name matching |
     | `scale_mismatch` | 5 | A real N-fixation number, but bulk seawater, per-plant or per-nodule — not a per-organism rate |
     | `plausible` | 3 | Organism, paper subject and unit are mutually consistent — still unconfirmed against full text |

     The sharpest cases:

     - **Two rows carry 426.5 µmol min⁻¹ mg⁻¹ from a paper titled *"Cloning, expression
       and characterization of a glycoside hydrolase family 51 α-L-arabinofuranosidase"***.
       That is an arabinofuranosidase specific activity. It is not nitrogenase, and it
       is attached to two organisms.
     - **Five *Azospirillum* species share one value (81 nmol ethylene h⁻¹)** from a
       preprint describing a *sixth* species, *A. actinidiae*.
     - ***Azospirillum baldaniorum* carries 120.26** from a paper describing
       *A. isscasi*. In the raw mined table that value is attributed to *A. isscasi*;
       curation moved it to the wrong organism.

     The three `plausible` rows are *Methylacidiphilum fumariolicum*, *Stutzerimonas
     stutzeri* (preprint) and *Klebsiella terrigena*.

     **This is not a criticism of the mining.** Sentence-level extraction over the ARA
     literature is genuinely hard: the papers report against inconsistent biomass
     denominators and frequently name several organisms per sentence. The extraction
     did what it was asked to do. The point is only that the output needs
     paper-by-paper adjudication before it becomes training labels.

     ## Evidence level — read this before quoting the table

     Every verdict rests on the **Crossref title plus the unit string**. Full texts
     were not read.

     That asymmetry matters, and the verdicts are graded to respect it: a title is
     sufficient to establish a *mismatch* (a paper titled as an arabinofuranosidase
     characterization is not reporting nitrogenase activity) and insufficient to
     establish a *match*. Hence `plausible`, never `confirmed`. Confirming any row
     requires reading the paper.

     ## Files

     | File | What it is |
     |---|---|
     | `audit_ara_provenance.py` | Re-runnable audit. Resolves each DOI through Crossref, joins the title to the row, applies the adjudication table. No credentials needed. |
     | `ara_provenance_audit.csv` | Output — 20 rows × 13 cols, one per curated ARA measurement, with `verdict`, `rationale` and `evidence_level`. |
     | `diazotroph_typestrain_shortlist.csv` | 80 organisms that are both NFixDB-confirmed diazotrophs and have a published growth rate — candidates for the type-strain acquisition
     discussed 8/5. 9 carry alternative (V or Fe-only) nitrogenases. |

     Re-run with:

     ```bash
     cd Cannon_data_provenance && python3 audit_ara_provenance.py
     ```

     The adjudications live in a `VERDICTS` dict keyed on `(organism, doi)`, so they
     are auditable against the source table and easy to overturn — if you read a paper
     and disagree, change the entry and say why in the rationale.

     ## Caveat on the shortlist

     `diazotroph_typestrain_shortlist.csv` pairs NFixDB diazotrophy with growth rates
     from `gp_growth_rate/data/dataset_master.csv`. Those growth rates carry **no
     medium or condition column** — so they cannot be assumed to be N-free, and they
     are not a fixation-rate proxy. The shortlist is an acquisition aid, not a label
     set.

     Most of the 9 alternative-nitrogenase organisms are anaerobes and several are
     archaea (*Methanosarcina*, *Methanobacterium*); they will not drop into aerobic
     spot-plate protocols as written. *Anabaena variabilis* (V-nitrogenase) is the
     most tractable single candidate. A culturability screen against the actual
     protocols should come before anything is ordered — that call belongs with Jen and
     Rebecca, not with me.
  ⎿  Async hook PostToolUse completed

∴ I realize the original README has content I'd lose if I overwrite it — the typestrain shortlist documentation with its culturability caveat and the note that the final call belongs to Jen
  and Rebecca, the evidence-level caveat about title-only evidence, the audit detail, and the re-run instructions. I also need to reconcile the original's count of 3 "plausible" cases with
  none surviving, since that was before I adjudicated those 3 against the full text and upgraded one of them.

  The best path is to preserve the original content as a provenance audit doc (updated to reflect the full-text adjudication), while making my new README the folder index that links to it
  and documents the shortlist file. I'll go ahead and restructure it that way.

⏺ That README documented the ARA audit and diazotroph_typestrain_shortlist.csv — including a culturability caveat that belongs with Jen and Rebecca. I nearly destroyed it. Restoring it as
  its own doc, updated for the full-text work done since:

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI; git show HEAD:Cannon_data_provenance/README.md > Cannon_data_provenance/docs/00_ara_provenance_audit.md; python3 -
      <<'PY'
      from pathlib import Path
      p=Path("Cannon_data_provenance/docs/00_ara_provenance_audit.md"); s=p.read_text()
      s=s.replace("# Cannon_data_provenance — provenance audit of the mined N-fixation rates",
                  "# The ARA provenance audit (2026-08-12, updated 2026-08-15)\n\n"
                  "> This was the folder's original README. It is preserved here in full because\n"
                  "> the audit and the type-strain shortlist it documents are still current. The\n"
                  "> one section superseded by later work is marked below.")
      s=s.replace("""| `plausible` | 3 | Organism, paper subject and unit are mutually consistent — still unconfirmed against full text |""",
                  """| `plausible` | 3 | Organism, paper subject and unit are mutually consistent — still unconfirmed against full text |

      > **SUPERSEDED 2026-08-15 — the three `plausible` rows were read against full text.**
      > *M. fumariolicum* SolV is now **`confirmed_conditional`**: 47.4 nmol ethylene h⁻¹
      > (mg cell dry weight)⁻¹ verified verbatim, wild type, but it is the rate at the
      > OPTIMAL 0.5% O₂ in chemostat culture, and the curated unit is missing its
      > `(mg cell dry weight)⁻¹` denominator. *Klebsiella terrigena* 110 is
      > **`misattributed`** — it is the rate of a *binary association* of *Bacillus firmus*
      > E3 with *K. terrigena*, and the source writes "ca. 110". *Stutzerimonas stutzeri*
      > 2176.6 is **`misattributed`** — an rpoB rifampicin-resistant lab mutant, and a
      > single 7 h time point at that. So the standing count is **1 of 20 surviving,
      > conditionally**, not 0 of 20. `ara_provenance_audit.csv` carries the updated
      > verdicts.""")
      p.write_text(s)
      print("preserved and annotated")
      PY
      head -6 Cannon_data_provenance/docs/00_ara_provenance_audit.md)
  ⎿  preserved and annotated
     # The ARA provenance audit (2026-08-12, updated 2026-08-15)

     > This was the folder's original README. It is preserved here in full because
     > the audit and the type-strain shortlist it documents are still current. The
     > one section superseded by later work is marked below.
  ⎿  Async hook PostToolUse completed

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI; python3 - <<'PY'
      from pathlib import Path
      p=Path("Cannon_data_provenance/README.md"); s=p.read_text()
      s=s.replace("""| [`docs/01_workflow.md`](docs/01_workflow.md) | How the pipeline works, stage by stage, with the measured loss at each stage |""",
      """| [`docs/00_ara_provenance_audit.md`](docs/00_ara_provenance_audit.md) | The original provenance audit of the 20 curated ARA rates — **and the type-strain shortlist**, which is
      unrelated to the mining work and still live |
      | [`docs/01_workflow.md`](docs/01_workflow.md) | How the pipeline works, stage by stage, with the measured loss at each stage |""")
      s=s.replace("""## Feedback wanted""",
      """## Also in this folder, from earlier work

      `diazotroph_typestrain_shortlist.csv` — 80 organisms that are both NFixDB-confirmed
      diazotrophs and have a published growth rate, as candidates for type-strain
      acquisition. **It is an acquisition aid, not a label set:** the growth rates carry
      no medium or condition column, so they cannot be assumed N-free and are not a
      fixation-rate proxy. 9 carry alternative (V or Fe-only) nitrogenases, most of
      which are anaerobes or archaea and will not drop into aerobic spot-plate
      protocols as written. A culturability screen against the actual protocols should
      come first — **that call belongs with Jen and Rebecca, not with me.**

      ## Feedback wanted""")
      p.write_text(s)
      PY
      ls -R Cannon_data_provenance | head -30; echo; git status --short | head -20)
  ⎿  ara_provenance_audit.csv
     audit_ara_provenance.py
     data
     diazotroph_typestrain_shortlist.csv
     docs
     README.md
     scripts

     Cannon_data_provenance/data:
     README.md
     stage1_corpus_manifest.csv
     stage2_extracted_raw.csv
     stage3_adjudicated_all.csv
     stage4_accepted.csv
     stage4b_flagged_not_strain_labels.csv
     stage5_canonical_comparable.csv
     stage5b_protein_normalised.csv
     stage6_hand_audit_170.csv

     Cannon_data_provenance/docs:
     00_ara_provenance_audit.md
     01_workflow.md
     02_agentic_tool_proposal.md
     03_data_quality_report.md

     Cannon_data_provenance/scripts:
     audit_ara_provenance.py
     export_deliverable.py
     fulltext_fetch.py
     harvest_epmc.py

      M Cannon_data_provenance/README.md
     ?? Cannon_data_provenance/data/
     ?? Cannon_data_provenance/docs/
     ?? Cannon_data_provenance/scripts/
  ⎿  Async hook PostToolUse completed

∴ I'm noticing the script count doesn't quite match what was listed, and there's a duplicate — audit_ara_provenance.py exists both at the top level and inside scripts/, with the top-level
  one being the original referenced by the old README.

  I'll remove the duplicate from scripts/ to avoid confusion, add a scripts/README explaining each file is a snapshot, then verify nothing outside Cannon_data_provenance was touched before
  committing and pushing without opening a PR.

  Bash(cd /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI/Cannon_data_provenance; rm -f scripts/audit_ara_provenance.py; cat > scripts/README.md <<'EOF'
      # Pipeline scripts — a snapshot, not a package

      These are copies of the working scripts as of 2026-08-19, included so the
      workflow can be read and re-run rather than taken on trust. They are **research
      scripts**: they assume a local model endpoint and a local corpus directory, and
      they are the starting point for — not the outcome of — the tool proposal in
      `../docs/02_agentic_tool_proposal.md`.

      | script | what it does |
      |---|---|
      | `harvest_epmc.py` | Europe PMC topic query → JATS XML on disk. Zero dependencies |
      | `fulltext_fetch.py` | DOI → full text via Europe PMC, NCBI PMC, Unpaywall (first success wins) |
      | `table_extract.py` | **The core.** Renders tables as tables, extracts rates via a local LLM, and adjudicates every rate. All ~20 rules live here, each with its rationale in a
      comment |
      | `mine_unit_vocabulary.py` | Parses accepted rates' units, canonicalises within denominator class, reports what will not parse |
      | `mine_citation_contexts.py` | Ranks works cited by the corpus by whether the citing sentence asserts a rate |
      | `score_adjudication.py` | Regression harness — replays the rules against hand verdicts and reports the confusion matrix |
      | `export_deliverable.py` | Produces the staged CSVs in `../data/` |

      `../audit_ara_provenance.py` (top level) is the separate, self-contained ARA
      provenance audit; run it with `python3 audit_ara_provenance.py`.

      ## Re-running the extractor

      ```bash
      python3 table_extract.py --xml-dir <corpus> --jsonl out.jsonl --resume \
              --workers 4 --model qwen3-8b-nothink --max-tokens 2500
      ```

      `--workers 4` is measured, not arbitrary: 4 → 3.84 papers/min, 6 → 2.98,
      8 → 1.37 (the GPU thrashes). `--adjudicate-only` re-applies the rules to an
      existing JSONL without any new inference, which is how rule changes are tested
      cheaply.
      EOF
      ls scripts/; cd ..; git status --short)
  ⎿  export_deliverable.py
     fulltext_fetch.py
     harvest_epmc.py
     mine_citation_contexts.py
     mine_unit_vocabulary.py
     README.md
     score_adjudication.py
     table_extract.py
      M Cannon_data_provenance/README.md
     ?? Cannon_data_provenance/data/
     ?? Cannon_data_provenance/docs/
     ?? Cannon_data_provenance/scripts/
  ⎿  Loaded CLAUDE.md
  ⎿  Async hook PostToolUse completed

∴ I'm noting the team's CLAUDE.md conventions: code belongs in git but large data doesn't, work should happen on a branch with a PR rather than pushing to main, and I need to claim tasks by
  checking PROGRESS.md and open issues first. I'm now working through a conflict since my data directory is 8.1 MB and includes stage2 outputs that shouldn't be committed.

  8 MB total across stage2/stage3 CSVs feels acceptable since it's well under GitHub's limits and isn't genome-scale data, so I'll keep it since the user explicitly requested it, just
  flagging the size in the README or commit message. The second conflict is trickier: the team convention asks contributors to add a dated line to PROGRESS.md, but my own policy treats
  editing another person's files as off-limits — though PROGRESS.md is a shared team file rather than someone's personal file, so I need to think through whether that exception applies
  here.

  I'll leave opening a PR as the user's call and just flag it. Now let me commit and push, but first I should check the total size and file count.

⏺ Two team conventions in CLAUDE.md I need to respect. I'm compliant on branching (not pushing to main), but let me check the data-size one before committing:

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI; du -sh Cannon_data_provenance; echo "--- largest ---"; find Cannon_data_provenance -type f -size +500k -exec ls -lh
      {} \; | awk '{print $5, $9}'; echo "--- gitignore check ---"; git check-ignore -v Cannon_data_provenance/data/stage3_adjudicated_all.csv || echo "not ignored"; echo "--- total files
      to add ---"; git add -An Cannon_data_provenance | wc -l)
  ⎿  8.3M       Cannon_data_provenance
     --- largest ---
     981K Cannon_data_provenance/data/stage1_corpus_manifest.csv
     3.7M Cannon_data_provenance/data/stage3_adjudicated_all.csv
     3.0M Cannon_data_provenance/data/stage2_extracted_raw.csv
     --- gitignore check ---
     not ignored
     --- total files to add ---
     22
  ⎿  Async hook PostToolUse completed

∴ The total size is 8.3 MB across 22 files, well within git limits since these are CSV deliverables rather than the prohibited genomes or caches. I'll proceed to commit and push to
  cannon/data-provenance-audit with a clear commit message.

⏺ 8.3 MB of result CSVs across 22 files — text, not genomes or caches, and explicitly the deliverable. Committing and pushing to your branch:

⏺ Bash(cd /Users/nathanielcannon/Claude/Projects/WVU/collab/IMAGINE-AI; git add Cannon_data_provenance && git commit -q -m "Add literature-mining pipeline: workflow docs, staged data, tool
      proposal

      Extends Cannon_data_provenance with the full-text mining work that followed the
      ARA provenance audit.

      RESULTS. 6,367 Europe PMC open-access nitrogenase papers screened; 7,953 rates
      proposed; 273 accepted from 85 papers. A row-by-row hand audit of a 170-rate
      slice puts precision at 0.76, so ~205 are defensible. 144 are protein-normalised
      and mutually comparable; the remaining denominator classes do not convert
      without per-organism biomass factors.

      DOCS.
        00 the original ARA audit, preserved, annotated where full-text reading has
           since superseded it (1 of 20 survives conditionally, not 0 of 20)
        01 the workflow stage by stage, with each stage's MEASURED loss
        02 a proposal for an engineered, reproducible tool with controlled model
           endpoints, budgets and rule packs
        03 a data quality report benchmarked against Jen_data from literature

      DATA. Six staged datasets rather than one file, because the losses are the
      finding: raw proposals, all rows with verdicts and reasons, accepted, flagged,
      canonicalised, and the hand-audited slice. Nothing is silently dropped - every
      rejected row keeps its reason, so any rule can be reversed by filtering.

      Additive and confined to Cannon_data_provenance/. No other file is touched, and
      no PR is opened." && git log --oneline -2 | cat && git push origin cannon/data-provenance-audit 2>&1 | tail -4)
  ⎿  03e5283 Add literature-mining pipeline: workflow docs, staged data, tool proposal
     a2b8be2 Add Cannon_data_provenance: provenance audit of the curated ARA rates
     To github.com:emm0012-wvu/IMAGINE-AI.git
        a2b8be2..03e5283  cannon/data-provenance-audit -> cannon/data-provenance-audit
  ⎿  Async hook PostToolUse completed

⏺ Pushed to emm0012-wvu/IMAGINE-AI on cannon/data-provenance-audit, all inside Cannon_data_provenance/. Nothing outside that folder is touched and no PR is open — that stays a two-party
  decision.

  What's there:

  - docs/01_workflow.md — the pipeline stage by stage, each with its measured loss: 6,368 hits → 6,367 retrieved → 5,431 past the topic gate → 7,953 rates proposed → 273 accepted → ~205
  defensible. Includes the finding that most changes how you'd spend compute: querying on the biomass denominator yields 1.15 accepted rates/paper vs 0.009 for the broad topic query —
  ~128×.
  - docs/02_agentic_tool_proposal.md — run manifests pinning code/prompt/model digest/corpus hash, a content-addressed cache so re-runs are free and identical, provider adapters
  (Ollama/LiteLLM/Anthropic/OpenAI) selected by config, enforced budget and rate limits, and rule packs as YAML so a second phenotype doesn't mean a second script. Phased at ~3–4 weeks,
  with phases 1–2 independently valuable. It's honest that bit-reproducibility on re-inference isn't achievable — it promises traceability plus replay instead.
  - docs/03_data_quality_report.md — benchmarked against Jen_data from literature/. Side-by-side on provenance, denominator completeness (60% → 99.6%), subject_type (absent → present), and
  retained rejections (none → 7,511 with reasons).
  - data/ — six staged datasets with a column-level README, plus a caution against pooling denominator classes.
  - scripts/ — the seven working scripts, labelled a snapshot rather than a package.

  Three things to flag:

  1. I nearly destroyed your existing README. I overwrote it before reading it, then recovered it from git — it documented the ARA audit and diazotroph_typestrain_shortlist.csv, including
  the culturability caveat that the call belongs with Jen and Rebecca. It's preserved in full as docs/00_ara_provenance_audit.md, annotated where the later full-text reading superseded it
  (1 of 20 survives conditionally, not the 0 of 20 the original stated). My mistake, and it's the kind that loses a colleague's work silently.
  2. On the comparison with Jen's data — I wrote it to be fair. Her dataset was built from titles and snippets because full-text retrieval didn't exist in this project then, and it covers a
  far broader phenotype scope. The report says explicitly that the difference is mostly in what evidence was reachable, not in care taken. It also records that my pipeline reproduced one
  of the same failure modes — five accepted rates were values a paper had cited from four other papers.
  3. Two team conventions need your call, not mine. CLAUDE.md asks contributors to claim work with a dated line in PROGRESS.md — I didn't add one, because writing to a shared file others
  depend on is a halt-and-ask item under my own policy. It also says to open a PR; I haven't. Say the word on either and I'll do it.

✻ Brewed for 7m 21s · 2 shells still running

❯ Watcher here. Context is heavy and a refresh is imminent — please save any in-progress working details to .claude/context/.scratchpad.genie.md (update it, don't append blindly; it is
  your resume doc), then stop. No need to reply at length.
  ⎿  Async hook PostToolUse completed

∴ I should update the scratchpad to reflect the current state rather than stale in-progress notes — the corpus is now complete with 6,367 EPMC papers, 273 accepted and 141 flagged, and
  everything's been pushed to both the WVU repo main and the team repo's data-provenance-audit branch.

  Open items remaining are the PROGRESS.md line and PR decision (user's call), the escalation tier pilot, and a second rule pack. I'll preserve the durable findings, governance notes,
  environment gotchas, and open questions while rewriting the rest wholesale in one efficient write.

✢ Reticulating splines… (10s · ↓ 299 tokens)

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  🟢 opus-5·1M  @Resume work from checkpoint context  main +2899-148 e:low △ exc-200k                                                                                         366381 tokens
  [▓▓▓▓▓▓▓▓│┃············╿·····] 37% 366.4K  Δ4.6K/m  S:4m H:11m  cache:99% eph1h:100%  warm/write/new                                                                                Debug
  $35.80  ⏱50h13m api:1%  5h:6%↺4h40m  7d:20%↺2d14h
  ⏵⏵ bypass permissions on · 2 shells · ← 1 agent

