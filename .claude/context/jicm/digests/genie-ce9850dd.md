# .scratchpad.genie.md

## Current State

### In-Progress Jobs
- **No-hint control** on the 159 papers (task `ba4jxr57k`)
- **Retry of the 18** truncated papers at 6,000 tokens
- **8 workers** currently running against LiteLLM (4 workers is the measured optimum)

### Key Findings
- **Truncation affected 137 papers (2.2%)**, not the entire corpus
- **134 of those 137** are recoverable truncations from the same `qwen3-8b-nothink` model
- **Phase A** (re-mine 159 held papers) resulted in **13 accepted rates from 5 papers**
- **The 3-paper smoke test** was overly optimistic (0.67/paper vs 0.082/paper in the full population)
- **Tier1 evidence** identifies papers with `"acetylene reduction"` AND `"mg protein"`, but most of those papers do not report strain rates (many are plant-symbiotic or bulk-environmental measurements)

### Next Steps
- **Run a targeted re-run** of the 137 truncated papers to recover lost data
- **Wait for the results** of the no-hint control and the retry of the 18 truncated papers
- **Decide whether to run the full 6,367-paper re-run** based on the results of the targeted re-run and the control

### Files and Metrics
- **Files**: `.scratchpad.genie.md`, `epmc_rates.jsonl`, `corpus_run.jsonl`, `b6x0ynjzn.output`, `bj1m1colo.output`, `fulltext_access.json`, `remoteauth.pl`, `cookies.txt`, `table_extract.py`, `fulltext_acquire.py`, `tier1_expansion_report.json`, `b38gclsu0.output`, `harvest_epmc.py`, `AEM.02694`, `citation_candidates.json`, `fulltext_fetch.py`, `mic.0.036061`, `report.json`, `2026-08-15-fulltext-route-comparison.md`, `still_needed_manual.json`, `jb.01456`, `bekpoqc5e.output`, `2694-07.pdf`, `aem.2694-07.pdf`, `13205_2024_Article_4124.pdf`, `aem.02073-22.pdf`, `e01937-17.pdf`, `13205_2023_Article_3873.pdf`, `KPSB_16_1855016.pdf`, `github.com`, `08_tdm_access_routes.md`, `07_paywalled_shortlist.md`, `aem.02694`, `aem.02073`, `aem.01937`, `aem.06412`, `aem.01056`, `aem.70.9.5391-5397.2004`, `mmbr.63.1.21-53.1999`, `aem.62.4.1220-1226.1996`
- **Commit-like hashes**: `76446ba`, `6c429de9`, `d0f50440a6b1`, `56ccf29`, `1990ebc`, `9c8cf8d`, `eb84af4`
- **Key numbers/metrics**: 6,367, 6,000, 1.37, 2.2%, 5,255, 6,230, 9%, 11,899, 0.67, 0.082, 11%, 2,500, 9,000, 25%, 0.5%, 1%, 3.84, 278/287, 1,882, 2,376, 3,000, 99.3%, 6,372